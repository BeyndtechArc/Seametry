package main

import (
	"fmt"
	"path/filepath"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/store"
)

// TestReplayInputsHaveDistinctNaturalKeys checks, against the real
// committed fixtures with no database involved, the invariant
// migrations/observation/00002_raw_and_observations.sql enforces in
// Postgres: (source, request_key, source_event_at) is unique. This is what
// actually caught the schema's first design (raw_digest, adapter_version)
// silently collapsing 8 real observations to 2 rows, in CI against a real
// database; this test makes the same defect visible locally, with no
// database needed, before it reaches CI at all.
func TestReplayInputsHaveDistinctNaturalKeys(t *testing.T) {
	root := repoRoot(t)
	solana, err := loadSolanaFixtureInputs(filepath.Join(root, "shared", "fixtures", "mainnet"))
	if err != nil {
		t.Fatal(err)
	}
	jupiter, err := loadJupiterFixtureInputs(
		filepath.Join(root, "shared", "evidence", "depth-2026-09-24.json"),
		filepath.Join(root, "shared", "fixtures", "jupiter"),
	)
	if err != nil {
		t.Fatal(err)
	}

	all := append(append([]store.IngestInput{}, solana...), jupiter...)
	seen := make(map[string][]string) // natural key -> the inputs claiming it
	for _, in := range all {
		key := fmt.Sprintf("%s|%s|%s", in.Source, in.RequestKey, in.SourceEventAt.Format("2006-01-02T15:04:05Z"))
		seen[key] = append(seen[key], in.Mint)
	}
	for key, mints := range seen {
		if len(mints) > 1 {
			t.Errorf("natural key %q is claimed by %d inputs (%v), want 1; the UNIQUE constraint would collapse them to one row", key, len(mints), mints)
		}
	}
	if len(seen) != len(all) {
		t.Errorf("%d inputs produced only %d distinct natural keys", len(all), len(seen))
	}
}
