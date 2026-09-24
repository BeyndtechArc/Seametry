// Command depth measures executable depth for every captured instrument and
// writes what it found.
//
// It produces two things from one run so they cannot disagree. Every raw
// response is written unmodified to fixtures/jupiter/, because a captured
// provider payload is evidence and a normalised copy no longer hashes to its
// recorded digest. And a report is written to evidence/, with its prose
// generated from the same data.
//
// Jupiter allows about ten requests per ten seconds, so a full run takes over
// half a minute. That is the limiter working, not the tool being slow.
//
// Usage:
//
//	go run ./tools/depth
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/amount"
	"github.com/BeyndtechArc/Seametry/internal/liquidity"
	"github.com/BeyndtechArc/Seametry/internal/registry"
)

const slippageBps = 50

var fixtureDir = filepath.Join("fixtures", "jupiter")

// sizesUSDC are the notional sizes the policy measures depth at.
var sizesUSDC = []int64{100, 1000, 10000}

type pointReport struct {
	SizeUSDC        int64    `json:"size_usdc"`
	Availability    string   `json:"availability"`
	Code            string   `json:"provider_code,omitempty"`
	OutAtoms        string   `json:"out_atoms,omitempty"`
	ShortfallBps    *int64   `json:"shortfall_bps,omitempty"`
	StatedImpactBps *int64   `json:"stated_impact_bps,omitempty"`
	Venues          []string `json:"venues,omitempty"`
	ContextSlot     uint64   `json:"context_slot,omitempty"`
	RawSHA256       string   `json:"raw_sha256"`
}

type instrumentReport struct {
	Symbol   string        `json:"symbol"`
	Mint     string        `json:"mint"`
	Decimals uint8         `json:"decimals"`
	Points   []pointReport `json:"points"`
}

type report struct {
	CapturedAt  time.Time          `json:"captured_at"`
	Quote       string             `json:"quote_asset"`
	SlippageBps int                `json:"slippage_bps"`
	Instruments []instrumentReport `json:"instruments"`
	Spent       string             `json:"spent"`
}

func main() {
	key := os.Getenv("JUP_KEY")
	if key == "" {
		fmt.Fprintln(os.Stderr, "depth: JUP_KEY is not set. The public endpoint answers without one, but at a lower limit.")
	}

	mints, err := loadMints()
	if err != nil {
		fail(err)
	}

	client := liquidity.New(liquidity.Options{APIKey: key})
	ctx := context.Background()
	rep := report{Quote: "USDC", SlippageBps: slippageBps}

	sizes := make([]amount.Amount, len(sizesUSDC))
	for i, s := range sizesUSDC {
		sizes[i], err = liquidity.WholeUSDC(s)
		if err != nil {
			fail(err)
		}
	}

	if err := os.MkdirAll(fixtureDir, 0o755); err != nil {
		fail(err)
	}

	for _, m := range mints {
		fmt.Printf("%-8s", m.symbol)
		curve, err := client.Sample(ctx, liquidity.Request{
			InputMint: liquidity.USDCMint, OutputMint: m.mint,
			InputDecimals: liquidity.USDCDecimals, OutputDecimals: int32(m.decimals),
			SlippageBps: slippageBps,
		}, sizes)
		if err != nil {
			fail(err)
		}

		item := instrumentReport{Symbol: m.symbol, Mint: m.mint, Decimals: m.decimals}
		for i, p := range curve.Points {
			capture := liquidity.NewCapture(m.symbol, m.mint, sizesUSDC[i], p.Observation)
			if err := liquidity.WriteCapture(fixtureDir, capture); err != nil {
				fail(err)
			}
			item.Points = append(item.Points, describe(sizesUSDC[i], p))
			fmt.Printf(" %s", p.Observation.Availability)
		}
		fmt.Println()
		rep.Instruments = append(rep.Instruments, item)
	}

	sort.Slice(rep.Instruments, func(i, j int) bool { return rep.Instruments[i].Symbol < rep.Instruments[j].Symbol })
	rep.CapturedAt = time.Now().UTC()
	rep.Spent = client.Usage().String()

	stamp := rep.CapturedAt.Format("2006-01-02")
	jsonPath := filepath.Join("evidence", "depth-"+stamp+".json")
	body, err := json.MarshalIndent(rep, "", "  ")
	if err != nil {
		fail(err)
	}
	if err := os.WriteFile(jsonPath, append(body, '\n'), 0o644); err != nil {
		fail(err)
	}
	mdPath := filepath.Join("evidence", "depth-"+stamp+".md")
	if err := os.WriteFile(mdPath, []byte(renderNote(rep)), 0o644); err != nil {
		fail(err)
	}
	fmt.Printf("\nwrote %s\nwrote %s\nrpc: %s\n", jsonPath, mdPath, rep.Spent)
}

func describe(size int64, p liquidity.Point) pointReport {
	out := pointReport{
		SizeUSDC: size, Availability: string(p.Observation.Availability),
		Code: p.Observation.Code, RawSHA256: p.Observation.RawSHA256,
		ShortfallBps: p.ShortfallBps,
	}
	if q := p.Observation.Quote; q != nil {
		out.OutAtoms = q.Out.AtomsString()
		out.StatedImpactBps = q.StatedImpactBps
		out.ContextSlot = q.ContextSlot
		seen := map[string]bool{}
		for _, hop := range q.Hops {
			if !seen[hop.Venue] {
				seen[hop.Venue] = true
				out.Venues = append(out.Venues, hop.Venue)
			}
		}
	}
	return out
}

type mint struct {
	symbol   string
	mint     string
	decimals uint8
}

// loadMints reads the captured mainnet fixtures, taking decimals from the mint
// itself rather than assuming the common value.
func loadMints() ([]mint, error) {
	dir := filepath.Join("fixtures", "mainnet")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w (run: go run ./tools/capture)", dir, err)
	}
	var out []mint
	for _, e := range entries {
		if e.IsDir() || e.Name() == "targets.json" || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		var f struct {
			Symbol  string `json:"symbol"`
			Address string `json:"address"`
			Data    string `json:"data_base64"`
		}
		if err := json.Unmarshal(raw, &f); err != nil {
			return nil, err
		}
		data, err := base64.StdEncoding.DecodeString(f.Data)
		if err != nil {
			return nil, err
		}
		decoded, err := registry.DecodeMint(data)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", f.Symbol, err)
		}
		out = append(out, mint{f.Symbol, f.Address, decoded.Decimals})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].symbol < out[j].symbol })
	return out, nil
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "depth:", err)
	os.Exit(1)
}
