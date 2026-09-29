package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/amount"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/liquidity"
	"github.com/BeyndtechArc/Seametry/server/internal/store/observationdb"
)

// jupiterSource is adapter_jupiter.go's source string.
const jupiterSource = "jupiter:quote"

// depthPayload mirrors adapter_jupiter.go's jupiterPayload: the subset of
// fields a curve needs, read back by field name (the two never need to be
// the same Go type, only agree on the JSON they exchange, the same relation
// server/cmd/seametry/replay.go's mainnetFixture and jupiterCapture already
// have with their own counterparts).
type depthPayload struct {
	SizeUSDC        int64    `json:"size_usdc"`
	Availability    string   `json:"availability"`
	Code            string   `json:"provider_code,omitempty"`
	OutAtoms        string   `json:"out_atoms,omitempty"`
	StatedImpactBps *int64   `json:"stated_impact_bps,omitempty"`
	Venues          []string `json:"venues,omitempty"`
	ContextSlot     uint64   `json:"context_slot,omitempty"`
}

// buildCurve reads every stored Jupiter observation for mint as of asOf and
// reconstructs a liquidity.Curve from the normalized fields already
// persisted (never by re-fetching or re-deriving): the shortfall each point
// carries is computed once here, by liquidity.BuildCurve, on read, since it
// depends on which size ends up the reference and that can change as new
// sizes are observed.
func (s Server) buildCurve(ctx context.Context, mint string, decimals int32, asOf time.Time) (liquidity.Curve, error) {
	rows, err := s.Queries.LatestObservationsPerRequestKey(ctx, observationdb.LatestObservationsPerRequestKeyParams{
		Mint: mint, Source: jupiterSource, SourceEventAt: pgtype.Timestamptz{Time: asOf, Valid: true},
	})
	if err != nil {
		return liquidity.Curve{}, fmt.Errorf("querying depth observations for %s: %w", mint, err)
	}

	points := make([]liquidity.Point, 0, len(rows))
	for _, row := range rows {
		var p depthPayload
		if err := json.Unmarshal(row.Payload, &p); err != nil {
			return liquidity.Curve{}, fmt.Errorf("%s: a stored depth observation did not decode: %w", mint, err)
		}
		size, err := liquidity.WholeUSDC(p.SizeUSDC)
		if err != nil {
			return liquidity.Curve{}, err
		}
		obs := liquidity.Observation{
			Availability: liquidity.Availability(p.Availability),
			Code:         p.Code,
			ReceivedAt:   row.SourceEventAt.Time,
		}
		if p.Availability == string(liquidity.Available) {
			out, err := amount.ParseAtoms(p.OutAtoms, decimals)
			if err != nil {
				return liquidity.Curve{}, fmt.Errorf("%s: out_atoms %q did not parse: %w", mint, p.OutAtoms, err)
			}
			obs.Quote = &liquidity.Quote{
				In: size, Out: out, StatedImpactBps: p.StatedImpactBps,
				ContextSlot: p.ContextSlot, ReceivedAt: row.SourceEventAt.Time,
			}
			for _, v := range p.Venues {
				obs.Quote.Hops = append(obs.Quote.Hops, liquidity.Hop{Venue: v})
			}
		}
		points = append(points, liquidity.Point{Size: size, Observation: obs})
	}
	sort.Slice(points, func(i, j int) bool { c, _ := points[i].Size.Cmp(points[j].Size); return c < 0 })
	return liquidity.BuildCurve(points)
}

func toAPIDepthCurve(curve liquidity.Curve, now time.Time) api.DepthCurve {
	out := api.DepthCurve{ReferenceIndex: curve.Reference, Points: make([]api.DepthPoint, len(curve.Points))}
	for i, p := range curve.Points {
		// liquidity.Availability has four states (available, no_route,
		// not_tradable, unrecognised: quote.go); the contract's own
		// DepthPointAvailability enum has two. A direct cast produced an
		// enum value ("no_route") the contract never declares, caught by
		// TestToAPIDepthCurveHandlesNoRouteWithNoQuote. The refusal's own
		// reason survives in provider_code below either way.
		availability := api.DepthPointAvailabilityUnavailable
		if p.Observation.Availability == liquidity.Available {
			availability = api.DepthPointAvailabilityAvailable
		}
		dp := api.DepthPoint{
			Size:         api.Amount{Atoms: p.Size.AtomsString(), Scale: int(p.Size.Scale())},
			Availability: availability,
		}
		if p.Observation.Code != "" {
			code := p.Observation.Code
			dp.ProviderCode = &code
		}
		if p.ShortfallBps != nil {
			v := int(*p.ShortfallBps)
			dp.ShortfallBps = &v
		}
		if p.Observation.Availability == liquidity.Available {
			t := p.Observation.ReceivedAt
			dp.ReceivedAt = &t
			age := int(now.Sub(t).Seconds())
			dp.AgeSeconds = &age
		}
		out.Points[i] = dp
	}
	return out
}

func (s Server) GetInstrumentDepth(ctx context.Context, request api.GetInstrumentDepthRequestObject) (api.GetInstrumentDepthResponseObject, error) {
	// Selling is not measured yet (docs/prd/API.md section 5.1: "Selling
	// reports unavailable until it is measured"); the only capture this
	// build has is a buy quote (adapter_jupiter.go), so a direction of
	// sell always answers unavailable rather than guessing at a buy curve
	// for it.
	asOf := resolveAsOf(request.Params.AsOf)
	now := time.Now().UTC()
	if request.Params.Direction != nil && *request.Params.Direction == api.Sell {
		return api.GetInstrumentDepth200JSONResponse{
			Data: api.DepthCurve{ReferenceIndex: -1},
			Meta: api.Meta{
				ServedAt: now, AsOf: asOf, Completeness: api.Partial,
				Missing: &[]api.MissingPart{{Part: "depth.sell", State: api.MissingPartStateUnavailable, Reason: "SELL_DEPTH_NOT_MEASURED"}},
			},
		}, nil
	}

	d, ok, err := s.loadMint(ctx, request.Mint, asOf)
	if err != nil {
		return nil, err
	}
	if !ok {
		return api.GetInstrumentDepthdefaultApplicationProblemPlusJSONResponse{
			StatusCode: 404,
			Body: api.Problem{
				Type: problemTypeUnspecified, Title: "Not found", Status: 404,
				Detail: fmt.Sprintf("No observation of mint %s as of %s.", request.Mint, asOf.Format(time.RFC3339)),
			},
		}, nil
	}
	curve, err := s.buildCurve(ctx, request.Mint, int32(d.Mint.Decimals), asOf)
	if err != nil {
		return nil, err
	}
	return api.GetInstrumentDepth200JSONResponse{
		Data: toAPIDepthCurve(curve, now),
		Meta: api.Meta{ServedAt: now, AsOf: asOf, Completeness: api.Complete},
	}, nil
}
