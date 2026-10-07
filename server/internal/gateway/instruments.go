package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/registry"
	"github.com/BeyndtechArc/Seametry/server/internal/store/observationdb"
)

// solanaSource is the adapter_solana.go source string, named once here so a
// query and a comparison never drift apart by a typo.
const solanaSource = "solana:mainnet:getMultipleAccounts"

// decodedMint is one instrument's decoded facts plus the observation they
// came from, shared by ListInstruments, GetInstrument, GetInstrumentDepth
// and GetInstrumentAdmissibility so each decodes a mint's raw bytes once,
// the same way, rather than four times slightly differently.
type decodedMint struct {
	Mint         *registry.Mint
	Prerogatives registry.Prerogatives
	Observation  observationdb.ObservationObservation
}

// loadMint fetches the latest Solana observation for mint as of asOf and
// decodes it. It returns (nil, false, nil) when no observation exists yet,
// never an error: an instrument this build has not captured is an empty
// answer, not a failure (ENGINEERING_STANDARD.md section 13: "an
// incomplete answer says which parts are missing").
func (s Server) loadMint(ctx context.Context, mint string, asOf time.Time) (*decodedMint, bool, error) {
	obs, err := s.Queries.LatestObservationForMint(ctx, observationdb.LatestObservationForMintParams{
		Mint: mint, Source: solanaSource, SourceEventAt: pgtype.Timestamptz{Time: asOf, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("querying the latest observation for %s: %w", mint, err)
	}
	raw, err := s.Objects.Get(ctx, obs.RawDigest)
	if err != nil {
		return nil, false, fmt.Errorf("reading the stored raw bytes for %s: %w", mint, err)
	}
	m, err := registry.DecodeMint(raw)
	if err != nil {
		return nil, false, fmt.Errorf("decoding %s: %w", mint, err)
	}
	prerogatives, err := m.Prerogatives()
	if err != nil {
		return nil, false, fmt.Errorf("reading prerogatives for %s: %w", mint, err)
	}
	return &decodedMint{Mint: m, Prerogatives: prerogatives, Observation: obs}, true, nil
}

// toAPIInstrument builds the response shape from a decoded mint.
func toAPIInstrument(d *decodedMint, mint string) api.Instrument {
	// The slot is real, not derived from a timestamp (EXPLORER.md section
	// 3.2: "a fact with no slot is an assertion"): adapter_solana.go's
	// solanaPayload carries it, captured at read time from the same RPC
	// call that read this account. A payload that fails to decode, or
	// predates the field existing, leaves Slot at its zero value rather
	// than fabricating one.
	var p struct {
		Symbol string `json:"symbol"`
		Slot   uint64 `json:"slot"`
	}
	json.Unmarshal(d.Observation.Payload, &p)
	var capturedAt *time.Time
	if d.Observation.SourceEventAt.Valid {
		t := d.Observation.SourceEventAt.Time
		capturedAt = &t
	}
	return InstrumentView(d.Mint, d.Prerogatives, mint, p.Symbol, p.Slot, capturedAt, d.Observation.SourceEventAt.Time)
}

// InstrumentView is the wire shape of one decoded mint, with its multiplier
// resolved at resolveAt. Exported for the same reason as DecisionView: the
// Explorer's static admissions snapshot and the live endpoint share it.
func InstrumentView(m *registry.Mint, p registry.Prerogatives, mint, symbol string, slot uint64, capturedAt *time.Time, resolveAt time.Time) api.Instrument {
	inst := api.Instrument{
		Mint:              mint,
		Grade:             p.Grade(),
		Prerogatives:      toAPIPrerogatives(p.Sentences()),
		UnknownExtensions: []int{},
	}
	for _, u := range p.UnknownExtensions {
		inst.UnknownExtensions = append(inst.UnknownExtensions, int(u))
	}
	inst.Capture.Slot = fmt.Sprintf("%d", slot)
	inst.Capture.CapturedAt = capturedAt
	if symbol != "" {
		inst.Symbol = &symbol
	}
	if config, ok, err := m.ScaledUIAmount(); err == nil && ok {
		if resolved, err := config.Resolve(resolveAt); err == nil {
			inst.Multiplier = &api.ResolvedMultiplier{
				ActivationPending: resolved.ActivationPending,
				EffectiveAt:       resolved.EffectiveAt,
				NaiveIsStale:      resolved.NaiveIsStale,
				NaiveValue:        api.Amount{Atoms: resolved.NaiveValue.AtomsString(), Scale: int(resolved.NaiveValue.Scale())},
				Value:             api.Amount{Atoms: resolved.Value.AtomsString(), Scale: int(resolved.Value.Scale())},
				Source:            api.ResolvedMultiplierSource(resolved.Source),
			}
		}
	}
	return inst
}

func toAPIPrerogatives(sentences []string) []api.Prerogative {
	out := make([]api.Prerogative, len(sentences))
	for i, s := range sentences {
		out[i] = api.Prerogative{Sentence: s}
	}
	return out
}

func (s Server) ListInstruments(ctx context.Context, request api.ListInstrumentsRequestObject) (api.ListInstrumentsResponseObject, error) {
	asOf := resolveAsOf(request.Params.AsOf)
	mints, err := s.Queries.ListMintsWithObservations(ctx, solanaSource)
	if err != nil {
		return nil, fmt.Errorf("listing mints: %w", err)
	}

	data := make([]api.Instrument, 0, len(mints))
	var missing []api.MissingPart
	for _, mint := range mints {
		d, ok, err := s.loadMint(ctx, mint, asOf)
		if err != nil {
			// One mint's raw bytes failing to read or decode does not take
			// the rest of the list down with it (docs/SERVICE_CATALOG.md
			// section 2, rule 5: "failure is contained at the boundary...
			// it never takes a neighbour down with it"). Named in missing,
			// never silently dropped and never a 500 for every instrument
			// this build ever captured because one of them has a problem.
			missing = append(missing, api.MissingPart{Part: "instrument:" + mint, State: api.MissingPartStateUnavailable, Reason: "INSTRUMENT_LOAD_FAILED"})
			continue
		}
		if !ok {
			continue // nothing observed for this mint as of asOf; not an error, just not yet true
		}
		data = append(data, toAPIInstrument(d, mint))
	}

	now := time.Now().UTC()
	meta := api.Meta{ServedAt: now, AsOf: asOf, Completeness: api.Complete}
	if len(missing) > 0 {
		meta.Completeness = api.Partial
		meta.Missing = &missing
	}
	return api.ListInstruments200JSONResponse{Data: data, Meta: meta}, nil
}

func (s Server) GetInstrument(ctx context.Context, request api.GetInstrumentRequestObject) (api.GetInstrumentResponseObject, error) {
	asOf := resolveAsOf(request.Params.AsOf)
	d, ok, err := s.loadMint(ctx, request.Mint, asOf)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if !ok {
		return api.GetInstrumentdefaultApplicationProblemPlusJSONResponse{
			StatusCode: 404,
			Body: api.Problem{
				Type: problemTypeUnspecified, Title: "Not found", Status: 404,
				Detail: fmt.Sprintf("No observation of mint %s as of %s. Only mints seametry replay or a live capture has actually read exist here.", request.Mint, asOf.Format(time.RFC3339)),
			},
		}, nil
	}
	return api.GetInstrument200JSONResponse{
		Data: toAPIInstrument(d, request.Mint),
		Meta: api.Meta{ServedAt: now, AsOf: asOf, Completeness: api.Complete},
	}, nil
}

// resolveAsOf is docs/prd/API.md section 4.5: omitted means now.
func resolveAsOf(asOf *time.Time) time.Time {
	if asOf == nil {
		return time.Now().UTC()
	}
	return asOf.UTC()
}
