package main

import (
	"encoding/json"
	"os"
	"sort"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/policy"
	"github.com/BeyndtechArc/Seametry/server/internal/registry"
)

// Admission is one instrument's decoded facts and the decision the policy
// engine made on them, in the gateway's own wire types, so a reader built
// against this file reads GET /instruments and /admissibility unchanged
// once the API is deployed (decisions/2026-09-27-web-app-and-payments.md D2).
type Admission struct {
	Issuer string `json:"issuer"`
	// Decimals is not in api.Instrument, and a reader converting raw token
	// units to whole units cannot do without it.
	Decimals uint8 `json:"decimals"`
	// TokenProgram owns the mint account (the fixture's owner), and decides
	// which associated token account a holder receives the instrument in.
	TokenProgram     string         `json:"token_program"`
	Instrument       api.Instrument `json:"instrument"`
	Decision         api.Decision   `json:"decision"`
	CapacityUSDC     int64          `json:"capacity_usdc"`
	CapacityDecision api.Decision   `json:"capacity_decision"`
}

type admissionsSnapshot struct {
	Producer      string      `json:"producer"`
	AsOf          time.Time   `json:"as_of"`
	PolicyVersion string      `json:"policy_version"`
	ReferenceUSDC int64       `json:"reference_usdc"`
	Instruments   []Admission `json:"instruments"`
}

func admissionFor(f fixture, mint *registry.Mint, prerogatives registry.Prerogatives, result policy.Result, capacityUSDC int64, capacityDecision policy.Result) (Admission, error) {
	captured, err := time.Parse(time.RFC3339, f.CapturedAt)
	if err != nil {
		return Admission{}, err
	}
	return Admission{
		Issuer:           f.Issuer,
		Decimals:         mint.Decimals,
		TokenProgram:     f.Owner,
		Instrument:       gateway.InstrumentView(mint, prerogatives, f.Address, f.Symbol, f.Slot, &captured, decisionsAsOf),
		Decision:         gateway.DecisionView(result),
		CapacityUSDC:     capacityUSDC,
		CapacityDecision: gateway.DecisionView(capacityDecision),
	}, nil
}

// writeAdmissions writes every captured instrument's decision, refused ones
// included, so a reader can say why an instrument is absent from what it
// offers instead of silently leaving it out. Ordered by symbol and stamped
// with the fixed decision instant, never the wall clock, so regenerating it
// from unchanged evidence reproduces it byte for byte, which is what CI
// checks.
func writeAdmissions(path string, instruments []Instrument) error {
	doc := policy.Default()
	snapshot := admissionsSnapshot{
		Producer:      "go run ./server/cmd/explorer -admissions " + path,
		AsOf:          decisionsAsOf,
		PolicyVersion: doc.Version,
		ReferenceUSDC: doc.DepthReferenceUSDC,
	}
	for _, inst := range instruments {
		snapshot.Instruments = append(snapshot.Instruments, inst.Admission)
	}
	sort.Slice(snapshot.Instruments, func(i, j int) bool {
		return snapshot.Instruments[i].Instrument.Mint < snapshot.Instruments[j].Instrument.Mint
	})
	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}
