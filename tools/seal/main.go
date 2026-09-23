// Command seal builds a demonstration batch of receipts, seals it, and writes
// the proofs where an independent implementation can check them.
//
// Its output exists to be verified by something that is not this program. The
// Explorer's claim is that a visitor's own browser does the verification and
// Seametry does not, and that claim is only worth making if a receipt sealed
// by the Go engine actually verifies under a separate implementation of the
// same specification. tools/spec/verify-receipts.mjs is that implementation,
// and CI runs it against this output.
//
// The bodies here are invented. The scheme is not.
//
// Usage:
//
//	go run ./tools/seal
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/receipt"
)

type output struct {
	Note     string                   `json:"note"`
	SealedAt time.Time                `json:"sealed_at"`
	Root     string                   `json:"root"`
	Count    int                      `json:"count"`
	Proofs   []*receipt.Proof         `json:"proofs"`
	Private  map[string]privateReveal `json:"private_bodies_revealed_for_the_demonstration"`
}

type privateReveal struct {
	Body receipt.PrivateBody `json:"body"`
	Note string              `json:"note"`
}

func main() {
	out := "evidence/demo-batch"
	if len(os.Args) > 2 && os.Args[1] == "-out" {
		out = os.Args[2]
	}

	sealedAt := time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC)
	allocator := receipt.NewAllocator(sealedAt, 0)

	specs := []struct {
		kind         receipt.Kind
		basket       string
		band         receipt.SizeBand
		weakest      string
		venues       []string
		constituents []receipt.Constituent
	}{
		{
			kind: receipt.KindStrike, basket: "Alloy No. 1", band: receipt.Band1000To10000,
			weakest: "verified", venues: []string{"Hall"},
			constituents: []receipt.Constituent{
				{Ticker: "AAPLx", Mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", Grade: "certificate",
					IssuerCan: []string{
						"The issuer can freeze this where it sits.",
						"The issuer can pause all movement of this.",
						"The issuer can take this back from any wallet.",
						"The issuer can switch on a check of who may receive this.",
						"The issuer can change how many of these you appear to hold.",
					}},
				{Ticker: "NFLXx", Mint: "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL", Grade: "certificate",
					IssuerCan: []string{
						"The issuer can freeze this where it sits.",
						"The issuer can take this back from any wallet.",
						"The issuer can change how many of these you appear to hold.",
					}},
			},
		},
		{
			kind: receipt.KindAllocation, basket: "Personal allocation", band: receipt.Band100To1000,
			weakest: "unverified", venues: []string{"Meteora", "Raydium"},
			constituents: []receipt.Constituent{
				{Ticker: "CATx", Mint: "XsRvd1meWQ9kW1SrZPa1jokQqmBoPWWjd6wGTgdp5E6", Grade: "certificate",
					IssuerCan: []string{"The issuer can freeze this where it sits."}},
			},
		},
		{
			kind: receipt.KindMelt, basket: "Alloy No. 1", band: receipt.Band100To1000,
			weakest: "stale", venues: []string{"Hall"},
			constituents: []receipt.Constituent{
				{Ticker: "CRDAx", Mint: "XshoX6qy11Q4HHcaJKU6h7JVmVqXiAXPLACiGLqLTxZ", Grade: "certificate",
					IssuerCan: []string{
						"The issuer can freeze this where it sits.",
						"The issuer can pause all movement of this.",
					}},
			},
		},
		{
			kind: receipt.KindWithdraw, basket: "Alloy No. 1", band: receipt.BandUnder100,
			weakest: "verified", venues: []string{"Hall"},
			constituents: []receipt.Constituent{
				{Ticker: "PALLx", Mint: "XsTTtPA5V19YwHKDv4xeVXNM6kdsQNJvg3MyWkRUckt", Grade: "certificate",
					IssuerCan: []string{"The issuer can take this back from any wallet."}},
			},
		},
		{
			kind: receipt.KindStrike, basket: "Alloy No. 1", band: receipt.BandOver10000,
			weakest: "verified", venues: []string{"Hall"},
			constituents: []receipt.Constituent{
				{Ticker: "STRKx", Mint: "XsaQGz41BEQkS9xAB44uvUtuXcdLJAXEU1dogEzWMZ8", Grade: "certificate",
					IssuerCan: []string{"The issuer can change how many of these you appear to hold."}},
			},
		},
	}

	receipts := make([]receipt.Receipt, 0, len(specs))
	for i, spec := range specs {
		serial, err := allocator.Next(sealedAt)
		if err != nil {
			fail(err)
		}
		salt, err := receipt.NewSalt()
		if err != nil {
			fail(err)
		}
		receipts = append(receipts, receipt.Receipt{
			Serial: serial,
			Public: receipt.PublicBody{
				Serial: string(serial), Kind: spec.kind, Month: "2026-09",
				Basket: spec.basket, Constituents: spec.constituents,
				WeakestEvidence: spec.weakest, SizeBand: spec.band, Venues: spec.venues,
				PolicyVersion: "policy-2026.09.3", Settlement: "finalized",
				Office: "Seametry Office, Port Harcourt",
			},
			Private: receipt.PrivateBody{
				Serial:         string(serial),
				Wallet:         fmt.Sprintf("DemoWa11et%022d", i+1),
				Signature:      fmt.Sprintf("DemoSignature%051d", i+1),
				ApprovedAtoms:  fmt.Sprintf("%d", 412500000+i*7919),
				SettledAtoms:   fmt.Sprintf("%d", 412873211+i*7919),
				FloorAtoms:     fmt.Sprintf("%d", 408375000+i*7919),
				Scale:          6,
				FeeAtoms:       "1237500",
				ApprovedAt:     sealedAt.Add(-time.Duration(i) * time.Minute),
				SettledAt:      sealedAt.Add(-time.Duration(i)*time.Minute + 11*time.Second),
				Slot:           449580424 + uint64(i),
				ApprovalDigest: fmt.Sprintf("%064x", i+1),
				Salt:           salt,
			},
		})
	}

	batch, err := receipt.NewBatch(receipts)
	if err != nil {
		fail(err)
	}

	result := output{
		Note: "A demonstration batch. The bodies are invented; the scheme is not. " +
			"Its root is not written on chain. Every proof here must verify under an " +
			"implementation that is not the one that produced it.",
		SealedAt: sealedAt,
		Root:     batch.Root().String(),
		Count:    len(batch.Receipts),
		Private:  map[string]privateReveal{},
	}
	for _, r := range batch.Receipts {
		proof, err := batch.Proof(r.Serial)
		if err != nil {
			fail(err)
		}
		// Self check before publishing. Writing a proof that does not verify
		// would be worse than writing none.
		ok, err := proof.Verify()
		if err != nil {
			fail(err)
		}
		if !ok {
			fail(fmt.Errorf("%s does not verify against the batch that produced it", r.Serial))
		}
		result.Proofs = append(result.Proofs, proof)

		result.Private[string(r.Serial)] = privateReveal{
			Body: r.Private,
			Note: "Revealed here only because this batch is a demonstration. In production a " +
				"private body never leaves its owner, and the owner reveals it with its salt " +
				"to prove what they approved.",
		}
	}

	if err := os.MkdirAll(out, 0o755); err != nil {
		fail(err)
	}
	path := filepath.Join(out, "batch.json")
	body, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fail(err)
	}
	if err := os.WriteFile(path, append(body, '\n'), 0o644); err != nil {
		fail(err)
	}

	fmt.Printf("sealed %d receipts\n", result.Count)
	fmt.Printf("root   %s\n", result.Root)
	for _, p := range result.Proofs {
		fmt.Printf("  %s  %-20s path length %d\n", p.Serial, p.Public.Kind, len(p.Path))
	}
	fmt.Printf("wrote %s\n", path)
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "seal:", err)
	os.Exit(1)
}
