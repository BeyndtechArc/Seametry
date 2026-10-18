package execution

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/BeyndtechArc/Seametry/server/internal/store"
)

// freshReport gives each test its own migrated database, as the receipt
// ledger's tests do, because Go runs packages in parallel against the one
// SEAMETRY_TEST_DATABASE_URL.
func freshReport(t *testing.T) (*Report, *pgxpool.Pool) {
	t.Helper()
	adminDSN := os.Getenv("SEAMETRY_TEST_DATABASE_URL")
	if adminDSN == "" {
		t.Skip("SEAMETRY_TEST_DATABASE_URL is not set; the record's guarantees are Postgres constraints and need a real Postgres to prove")
	}
	ctx := context.Background()
	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := "activity_" + hex.EncodeToString(suffix)
	admin, err := store.Open(adminDSN)
	if err != nil {
		t.Fatalf("opening the admin connection: %v", err)
	}
	t.Cleanup(func() { admin.Close() })
	if _, err := admin.ExecContext(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("creating %s: %v", name, err)
	}
	parsed, err := url.Parse(adminDSN)
	if err != nil {
		t.Fatalf("SEAMETRY_TEST_DATABASE_URL is not a URL: %v", err)
	}
	parsed.Path = "/" + name
	db, err := store.Open(parsed.String())
	if err != nil {
		t.Fatalf("opening %s: %v", name, err)
	}
	if err := store.MigrateAll(ctx, db); err != nil {
		t.Fatalf("migrating %s: %v", name, err)
	}
	db.Close()
	pool, err := store.OpenPool(ctx, parsed.String())
	if err != nil {
		t.Fatalf("opening a pool on %s: %v", name, err)
	}
	t.Cleanup(func() {
		pool.Close()
		if _, err := admin.ExecContext(ctx, "DROP DATABASE "+name+" WITH (FORCE)"); err != nil {
			t.Errorf("dropping %s: %v", name, err)
		}
	})
	return NewReport(pool), pool
}

const (
	holder = "FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM"
	nvdax  = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh"
)

func id(t *testing.T) [16]byte {
	t.Helper()
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		t.Fatal(err)
	}
	return value
}

func digest(t *testing.T) string {
	t.Helper()
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		t.Fatal(err)
	}
	return hex.EncodeToString(value)
}

func preparedQuote(t *testing.T, touch *FirstTouch) Quote {
	t.Helper()
	return Quote{
		ID: id(t), Wallet: holder, Network: "mainnet", Kind: "buy", Subject: "Prime Seven", PlanSize: 1,
		Deployment: "production", PreparedAt: time.Date(2026, 10, 16, 9, 0, 0, 0, time.UTC), FirstTouch: touch,
		Legs: []Leg{{
			ID: id(t), Mint: nvdax, Symbol: "NVDAx", In: Amount{"1000000", 6}, Out: Amount{"450000", 8}, Floor: Amount{"445500", 8},
			RoutingFeeBps: 19, TipOffsetBps: 6, SimulatedFeeAtoms: "1900", TipLamports: "5000", Landing: "sender",
			LastValidBlockHeight: 435000000, MessageSHA256: digest(t),
		}},
	}
}

func count(t *testing.T, pool *pgxpool.Pool, query string, args ...any) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

func TestAQuoteIsRecordedOnceHoweverOftenItIsReported(t *testing.T) {
	report, pool := freshReport(t)
	ctx := context.Background()
	quote := preparedQuote(t, nil)
	for range 3 {
		if err := report.RecordQuote(ctx, quote); err != nil {
			t.Fatalf("recording the quote: %v", err)
		}
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.quotes"); n != 1 {
		t.Fatalf("quotes: got %d, want 1", n)
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.legs WHERE quote_id = $1", quote.ID); n != 1 {
		t.Fatalf("legs: got %d, want 1", n)
	}
	var source string
	if err := pool.QueryRow(ctx, "SELECT source FROM execution.legs").Scan(&source); err != nil || source != "server" {
		t.Fatalf("leg source: got %q (%v), want server", source, err)
	}
}

func TestAWalletKeepsTheFirstSourceItWasSeenWith(t *testing.T) {
	report, pool := freshReport(t)
	ctx := context.Background()
	if err := report.RecordQuote(ctx, preparedQuote(t, nil)); err != nil {
		t.Fatal(err)
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.wallets WHERE first_source IS NULL"); n != 1 {
		t.Fatalf("a wallet seen without a source should have none; rows without: %d", n)
	}
	// An empty source is no source.
	if err := report.RecordQuote(ctx, preparedQuote(t, &FirstTouch{})); err != nil {
		t.Fatal(err)
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.wallets WHERE first_source IS NULL"); n != 1 {
		t.Fatal("an empty first touch was kept as a source")
	}
	if err := report.RecordQuote(ctx, preparedQuote(t, &FirstTouch{ReferrerHost: "x.com", UTMCampaign: "colosseum"})); err != nil {
		t.Fatal(err)
	}
	if err := report.RecordQuote(ctx, preparedQuote(t, &FirstTouch{ReferrerHost: "google.com"})); err != nil {
		t.Fatal(err)
	}
	var source string
	if err := pool.QueryRow(ctx, "SELECT first_source::text FROM execution.wallets").Scan(&source); err != nil {
		t.Fatal(err)
	}
	if source != `{"utm_campaign": "colosseum", "referrer_host": "x.com"}` {
		t.Fatalf("first source: got %s, want the first one kept, x.com with campaign colosseum", source)
	}
}

func TestARefusalIsRecordedWithItsReasonAndNoLegs(t *testing.T) {
	report, pool := freshReport(t)
	quote := preparedQuote(t, nil)
	quote.Legs = nil
	quote.Refusal = &Refusal{Status: 402, Text: "Add at least 0.002 SOL."}
	if err := report.RecordQuote(context.Background(), quote); err != nil {
		t.Fatal(err)
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.quotes WHERE outcome = 'refused' AND refusal_status = 402"); n != 1 {
		t.Fatalf("refused quotes with their status: %d", n)
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.legs"); n != 0 {
		t.Fatalf("a refusal recorded %d legs", n)
	}
}

func TestTheLargestU64AmountIsKeptExactly(t *testing.T) {
	report, pool := freshReport(t)
	quote := preparedQuote(t, nil)
	quote.Legs[0].Out = Amount{"18446744073709551615", 8}
	if err := report.RecordQuote(context.Background(), quote); err != nil {
		t.Fatal(err)
	}
	var out string
	if err := pool.QueryRow(context.Background(), "SELECT out_atoms::text FROM execution.legs").Scan(&out); err != nil {
		t.Fatal(err)
	}
	if out != "18446744073709551615" {
		t.Fatalf("out_atoms: got %s", out)
	}
}

func TestAReportIsRefusedNamingWhatIsWrong(t *testing.T) {
	report := NewReport(nil)
	cases := map[string]func(*Quote){
		"wallet":   func(q *Quote) { q.Wallet = "not-a-wallet" },
		"no legs":  func(q *Quote) { q.Legs = nil },
		"refused":  func(q *Quote) { q.Refusal = &Refusal{Status: 402, Text: "short"} },
		"atoms":    func(q *Quote) { q.Legs[0].In.Atoms = "1.5" },
		"scale":    func(q *Quote) { q.Legs[0].Floor.Scale = 6 },
		"landing":  func(q *Quote) { q.Legs[0].Landing = "jito" },
		"digest":   func(q *Quote) { q.Legs[0].MessageSHA256 = "ABC" },
		"subject":  func(q *Quote) { q.Subject = strings.Repeat("s", 201) },
		"referrer": func(q *Quote) { q.FirstTouch = &FirstTouch{ReferrerHost: strings.Repeat("h", 256)} },
	}
	for name, change := range cases {
		quote := preparedQuote(t, nil)
		change(&quote)
		var invalid Invalid
		if err := report.RecordQuote(context.Background(), quote); !errors.As(err, &invalid) {
			t.Errorf("%s: got %v, want an Invalid report", name, err)
		}
	}
}

func TestTheFirstSubmissionOfALegIsKept(t *testing.T) {
	report, pool := freshReport(t)
	ctx := context.Background()
	quote := preparedQuote(t, nil)
	if err := report.RecordQuote(ctx, quote); err != nil {
		t.Fatal(err)
	}
	message := quote.Legs[0].MessageSHA256
	signature := "54RpCChVq8WcN3xsfKSqxZ7ChzwR8hPzHu5x1L9jnpBcQ9JgVz3yrCe2sPj7bLv3QUs6oWw3MqfAZ6ETtx6MgsSa"
	sent := Submission{MessageSHA256: message, Signature: signature, SubmittedAt: time.Now(), Result: "sent"}
	if err := report.RecordSubmission(ctx, sent); err != nil {
		t.Fatalf("recording the submission: %v", err)
	}
	later := sent
	later.Result, later.Text = "uncertain", "a later report"
	if err := report.RecordSubmission(ctx, later); err != nil {
		t.Fatalf("a repeated submission is not an error: %v", err)
	}
	var result, recorded string
	if err := pool.QueryRow(ctx, "SELECT submit_result, signature FROM execution.legs").Scan(&result, &recorded); err != nil {
		t.Fatal(err)
	}
	if result != "sent" || recorded != signature {
		t.Fatalf("got %s %s, want the first submission kept", result, recorded)
	}
	unknown := sent
	unknown.MessageSHA256 = digest(t)
	if err := report.RecordSubmission(ctx, unknown); !errors.Is(err, ErrUnknownLeg) {
		t.Fatalf("an unrecorded digest: got %v, want ErrUnknownLeg", err)
	}
}

func TestAnUnknownFunnelKindIsKeptNotDropped(t *testing.T) {
	report, pool := freshReport(t)
	quote := id(t)
	events := []FunnelEvent{{Kind: "review_opened", Wallet: holder, QuoteID: &quote}, {Kind: "share_clicked"}}
	if err := report.RecordFunnel(context.Background(), "production", events, time.Now()); err != nil {
		t.Fatal(err)
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.funnel_events WHERE kind = 'review_opened' AND raw_kind IS NULL AND quote_id = $1", quote); n != 1 {
		t.Fatalf("known kind rows: %d", n)
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.funnel_events WHERE kind = 'unrecognised' AND raw_kind = 'share_clicked'"); n != 1 {
		t.Fatalf("unrecognised rows keeping what was sent: %d", n)
	}
	var invalid Invalid
	if err := report.RecordFunnel(context.Background(), "production", make([]FunnelEvent, 21), time.Now()); !errors.As(err, &invalid) {
		t.Fatalf("21 events: got %v, want Invalid", err)
	}
}
