package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/store"
)

// TestReplayWritesToPostgres is docs/prd/API.md section 12 step A2's own
// text: the store is never empty of real evidence, because replay puts the
// evidence already committed to this repository into it. It needs a real
// Postgres, so it skips, naming the variable, when SEAMETRY_TEST_DATABASE_URL
// is unset, the same gate every other Postgres test in this repository uses.
func TestReplayWritesToPostgres(t *testing.T) {
	dsn := os.Getenv("SEAMETRY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("SEAMETRY_TEST_DATABASE_URL is not set; this test needs a real Postgres 18 to replay into")
	}
	ctx := context.Background()

	admin, err := store.Open(dsn)
	if err != nil {
		t.Fatalf("opening the admin connection: %v", err)
	}
	defer admin.Close()
	if err := store.MigrateAll(ctx, admin); err != nil {
		t.Fatalf("applying every schema's migrations: %v", err)
	}

	root := repoRoot(t)
	t.Setenv("SEAMETRY_DATABASE_URL", dsn)
	t.Setenv("SEAMETRY_OBJECT_STORE_DIR", filepath.Join(t.TempDir(), "objects"))

	if err := replay(root); err != nil {
		t.Fatalf("replay: %v", err)
	}

	pool, err := store.OpenPool(ctx, dsn)
	if err != nil {
		t.Fatalf("opening a pool to check what replay wrote: %v", err)
	}
	defer pool.Close()

	var rawCount, obsCount int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM observation.raw_payloads").Scan(&rawCount); err != nil {
		t.Fatalf("counting raw_payloads: %v", err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM observation.observations").Scan(&obsCount); err != nil {
		t.Fatalf("counting observations: %v", err)
	}
	// 7 mainnet accounts + 21 Jupiter points = 28, the same figure
	// TestLoadSolanaFixtureInputsReadsEveryFixture and
	// TestLoadJupiterFixtureInputsReadsEveryPoint already check the loaders
	// produce; this confirms every one of them actually landed in Postgres.
	const want = 7 + 21
	if rawCount != want {
		t.Errorf("raw_payloads has %d rows, want %d", rawCount, want)
	}
	if obsCount != want {
		t.Errorf("observations has %d rows, want %d", obsCount, want)
	}

	// Replaying again must not double either table
	// (ENGINEERING_STANDARD.md section 9: "every event consumer is
	// idempotent"): the same evidence, replayed twice, is still one fact
	// about each instrument, not two.
	if err := replay(root); err != nil {
		t.Fatalf("replaying a second time: %v", err)
	}
	var rawCount2, obsCount2 int
	pool.QueryRow(ctx, "SELECT count(*) FROM observation.raw_payloads").Scan(&rawCount2)
	pool.QueryRow(ctx, "SELECT count(*) FROM observation.observations").Scan(&obsCount2)
	if rawCount2 != want {
		t.Errorf("after a second replay, raw_payloads has %d rows, want still %d", rawCount2, want)
	}
	if obsCount2 != want {
		t.Errorf("after a second replay, observations has %d rows, want still %d", obsCount2, want)
	}
}
