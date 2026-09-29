package store

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/BeyndtechArc/Seametry/server/internal/liquidity"
)

// JupiterAdapterVersion is recorded on every observation this adapter
// produces (ENGINEERING_STANDARD.md section 5).
const JupiterAdapterVersion = "jupiter-quote-v1"

// jupiterPayload is this adapter's normalized shape: what shared/evidence/
// depth-*.md reports per point, minus the raw_sha256 (that lives on the
// IngestInput itself, not duplicated into the payload it names).
type jupiterPayload struct {
	SizeUSDC        int64    `json:"size_usdc"`
	Availability    string   `json:"availability"`
	Code            string   `json:"provider_code,omitempty"`
	OutAtoms        string   `json:"out_atoms,omitempty"`
	StatedImpactBps *int64   `json:"stated_impact_bps,omitempty"`
	Venues          []string `json:"venues,omitempty"`
	ContextSlot     uint64   `json:"context_slot,omitempty"`
}

// NormalizeJupiterObservation is the one place a Jupiter response becomes an
// IngestInput. The live path (CaptureJupiterQuote) and the replay path
// (server/cmd/seametry's replay command, replaying shared/fixtures/jupiter/
// and shared/evidence/depth-*.json) both call this, for the same reason
// adapter_solana.go's NormalizeSolanaAccount does.
func NormalizeJupiterObservation(mint string, sizeUSDC int64, obs liquidity.Observation) (IngestInput, error) {
	if len(obs.Raw) == 0 {
		return IngestInput{}, fmt.Errorf("store: no raw bytes for %s at %d USDC", mint, sizeUSDC)
	}

	p := jupiterPayload{
		SizeUSDC:     sizeUSDC,
		Availability: string(obs.Availability),
		Code:         obs.Code,
	}
	if obs.Quote != nil {
		p.OutAtoms = obs.Quote.Out.AtomsString()
		p.StatedImpactBps = obs.Quote.StatedImpactBps
		p.ContextSlot = obs.Quote.ContextSlot
		for _, h := range obs.Quote.Hops {
			p.Venues = append(p.Venues, h.Venue)
		}
	}
	payload, err := json.Marshal(p)
	if err != nil {
		return IngestInput{}, fmt.Errorf("store: normalizing a Jupiter quote for %s: %w", mint, err)
	}

	return IngestInput{
		Mint:              mint,
		RequestKey:        fmt.Sprintf("%s@%d", mint, sizeUSDC), // mint alone collapses different sizes: proven by a real replay of committed evidence (migrations/observation/00002_raw_and_observations.sql)
		Source:            "jupiter:quote",
		AdapterVersion:    JupiterAdapterVersion,
		SourceEventAt:     obs.ReceivedAt,
		ReceivedAt:        obs.ReceivedAt,
		VerificationState: "unverified",
		Raw:               obs.Raw,
		Payload:           payload,
	}, nil
}

// CaptureJupiterQuote observes one mint at one size and returns it as an
// IngestInput.
func CaptureJupiterQuote(ctx context.Context, client *liquidity.Client, mint string, req liquidity.Request, referenceSizeUSDC int64) (IngestInput, error) {
	obs, err := client.Observe(ctx, req)
	if err != nil {
		return IngestInput{}, fmt.Errorf("store: capturing a Jupiter quote for %s: %w", mint, err)
	}
	return NormalizeJupiterObservation(mint, referenceSizeUSDC, obs)
}
