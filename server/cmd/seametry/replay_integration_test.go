package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

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
	// Every mainnet account and every Jupiter point the loaders produce, the
	// figures TestLoadSolanaFixtureInputsReadsEveryFixture and
	// TestLoadJupiterFixtureInputsReadsEveryPoint already check; this
	// confirms every one of them actually landed in Postgres. Counted from
	// the loaders rather than typed, because capturing a mint adds an account.
	accounts, err := loadSolanaFixtureInputs(filepath.Join(root, "shared", "fixtures", "mainnet"))
	if err != nil {
		t.Fatal(err)
	}
	points, err := loadJupiterFixtureInputs(
		filepath.Join(root, "shared", "evidence", "depth-2026-09-24.json"),
		filepath.Join(root, "shared", "fixtures", "jupiter"),
	)
	if err != nil {
		t.Fatal(err)
	}
	want := len(accounts) + len(points)
	if obsCount != want {
		t.Errorf("observations has %d rows, want %d", obsCount, want)
		diagnoseObservations(t, ctx, pool)
	}
	// raw_payloads is content addressed: two distinct observations legitimately
	// share one raw_payloads row when a provider's own response bytes are
	// identical (this repository's own evidence has this: Jupiter's "no route"
	// body carries nothing size- or mint-specific for at least one refused
	// pair). It is bounded above by want and below by 1, not pinned to want.
	if rawCount < 1 || rawCount > want {
		t.Errorf("raw_payloads has %d rows, want between 1 and %d", rawCount, want)
	}
	t.Logf("raw_payloads: %d rows for %d observations (content-addressed dedup accounts for the gap, if any)", rawCount, obsCount)

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
	if rawCount2 != rawCount {
		t.Errorf("after a second replay, raw_payloads has %d rows, want still %d (the first replay's own count, not the fixture count: see the comment above about content-addressed dedup)", rawCount2, rawCount)
	}
	if obsCount2 != want {
		t.Errorf("after a second replay, observations has %d rows, want still %d", obsCount2, want)
	}
}

// diagnoseObservations prints every (source, request_key, source_event_at)
// group with more than one row, so a mismatch names the real duplicate
// rather than only its count. Called only on failure.
func diagnoseObservations(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	rows, err := pool.Query(ctx, `
		SELECT source, request_key, source_event_at, count(*), array_agg(mint)
		FROM observation.observations
		GROUP BY source, request_key, source_event_at
		HAVING count(*) > 1
	`)
	if err != nil {
		t.Logf("diagnostic query failed: %v", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var source, requestKey string
		var sourceEventAt time.Time
		var n int
		var mints []string
		if err := rows.Scan(&source, &requestKey, &sourceEventAt, &n, &mints); err != nil {
			t.Logf("scanning a diagnostic row: %v", err)
			continue
		}
		t.Logf("duplicate key: source=%s request_key=%s source_event_at=%s count=%d mints=%v", source, requestKey, sourceEventAt, n, mints)
	}
}
