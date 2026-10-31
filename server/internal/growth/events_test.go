package growth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/BeyndtechArc/Seametry/server/internal/execution"
	"github.com/BeyndtechArc/Seametry/server/internal/store"
	"github.com/BeyndtechArc/Seametry/server/internal/store/executiondb"
)

// fresh gives each test its own migrated database, as the execution
// record's tests do, because Go runs packages in parallel against the one
// SEAMETRY_TEST_DATABASE_URL.
func fresh(t *testing.T) (*Events, *execution.Report, *pgxpool.Pool) {
	t.Helper()
	adminDSN := os.Getenv("SEAMETRY_TEST_DATABASE_URL")
	if adminDSN == "" {
		t.Skip("SEAMETRY_TEST_DATABASE_URL is not set; the projection's guarantees are Postgres constraints and need a real Postgres to prove")
	}
	ctx := context.Background()
	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := "growth_" + hex.EncodeToString(suffix)
	admin, err := store.Open(adminDSN)
	if err != nil {
		t.Fatalf("opening the admin connection: %v", err)
	}
	t.Cleanup(func() { admin.Close() })
	if _, err := admin.ExecContext(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("creating %s: %v", name, err)
	}
	t.Cleanup(func() {
		if _, err := admin.ExecContext(ctx, "DROP DATABASE "+name+" WITH (FORCE)"); err != nil {
			t.Errorf("dropping %s: %v", name, err)
		}
	})
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
	t.Cleanup(pool.Close)
	return NewEvents(pool), execution.NewReport(pool), pool
}

const (
	holder = "FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM"
	nvdax  = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh"
	// A real mainnet signature's shape; nothing here reads the chain.
	signature = "5j7s6NiJS3JAkvgkoc18WVAsiSaci2pxB2A6ueCJP4tprA2TFg9wSyTLeYouxPBJEMzJinENTkpA52YStRW5Dia7"
)

var at = time.Date(2026, 10, 29, 9, 0, 0, 0, time.UTC)

func random(t *testing.T, n int) []byte {
	t.Helper()
	value := make([]byte, n)
	if _, err := rand.Read(value); err != nil {
		t.Fatal(err)
	}
	return value
}

// record writes one bought, sent and landed leg, with two funnel steps, one
// of a kind the record does not know, and answers the leg's id.
func record(t *testing.T, report *execution.Report, pool *pgxpool.Pool) [16]byte {
	t.Helper()
	ctx := context.Background()
	var quoteID, legID [16]byte
	copy(quoteID[:], random(t, 16))
	copy(legID[:], random(t, 16))
	digest := hex.EncodeToString(random(t, 32))
	quote := execution.Quote{
		ID: quoteID, Wallet: holder, Network: "mainnet", Kind: "buy", Subject: "Prime Seven", PlanSize: 1,
		Deployment: "production", PreparedAt: at,
		Conditions: &execution.Conditions{PolicyVersion: "policy-2026.10.1", SnapshotAt: at.AddDate(0, -1, 0), Legs: []execution.LegCondition{
			{Mint: nvdax, Decision: "WARN", Reasons: []execution.ConditionReason{{Code: "ISSUER_CAN_FREEZE", Severity: "WARN"}}},
		}},
		Legs: []execution.Leg{{
			ID: legID, Mint: nvdax, Symbol: "NVDAx", In: execution.Amount{Atoms: "1000000", Scale: 6}, Out: execution.Amount{Atoms: "450000", Scale: 8},
			Floor: execution.Amount{Atoms: "445500", Scale: 8}, RoutingFeeBps: 19, TipOffsetBps: 6, SimulatedFeeAtoms: "1900", TipLamports: "5000",
			Landing: "sender", LastValidBlockHeight: 435000000, MessageSHA256: digest,
		}},
	}
	if err := report.RecordFunnel(ctx, "production", []execution.FunnelEvent{{Kind: "wallet_connected", Wallet: holder}}, at.Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := report.RecordQuote(ctx, quote); err != nil {
		t.Fatal(err)
	}
	if err := report.RecordFunnel(ctx, "production", []execution.FunnelEvent{{Kind: "a_step_from_later", Wallet: holder, QuoteID: &quoteID}}, at.Add(30*time.Second)); err != nil {
		t.Fatal(err)
	}
	if err := report.RecordSubmission(ctx, execution.Submission{MessageSHA256: digest, Signature: signature, SubmittedAt: at.Add(time.Minute), Result: "sent"}); err != nil {
		t.Fatal(err)
	}
	if _, err := executiondb.New(pool).SettleLeg(ctx, executiondb.SettleLegParams{
		ID: pgtype.UUID{Bytes: legID, Valid: true}, ChainOutcome: pgtype.Text{String: "landed", Valid: true},
		BlockTime: pgtype.Timestamptz{Time: at.Add(65 * time.Second), Valid: true}, ReconciledAt: pgtype.Timestamptz{Time: at.Add(2 * time.Minute), Valid: true},
	}); err != nil {
		t.Fatal(err)
	}
	return legID
}

// projectAll projects until want events are written. Go runs packages in
// parallel against one Postgres, and a long writing transaction in any
// database on it holds the execution outbox back (docs/SERVICE_CATALOG.md
// section 3.6), so a test projects as the loop does: again, until the
// events are final.
func projectAll(t *testing.T, events *Events, outbox Outbox, want int) int {
	t.Helper()
	deadline := time.Now().Add(2 * time.Minute)
	written := 0
	for {
		n, err := events.Project(context.Background(), outbox, at)
		if err != nil {
			t.Fatalf("projecting: %v", err)
		}
		written += n
		if written >= want || time.Now().After(deadline) {
			return written
		}
		time.Sleep(200 * time.Millisecond)
	}
}

type seen struct{ Type, Source string }

func timeline(t *testing.T, events *Events) []Event {
	t.Helper()
	got, err := events.Timeline(context.Background(), holder, at.Add(time.Hour), 50)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestTheProjectionNamesEachRecordedChangeWithWhoseWordItIs(t *testing.T) {
	events, report, pool := fresh(t)
	record(t, report, pool)
	if written := projectAll(t, events, report, 5); written != 5 {
		t.Fatalf("written: got %d, want 5", written)
	}
	got := timeline(t, events)
	want := []seen{
		{"leg.landed", "chain"},
		{"leg.sent", "server"},
		{"funnel.unrecognised", "client"},
		{"preflight.run", "server"},
		{"wallet.connected", "client"},
	}
	if len(got) != len(want) {
		t.Fatalf("timeline: got %d events, want %d", len(got), len(want))
	}
	for i, event := range got {
		if (seen{event.Type, event.Source}) != want[i] {
			t.Fatalf("event %d: got %s from %s, want %s from %s", i, event.Type, event.Source, want[i].Type, want[i].Source)
		}
	}
	var unknown struct {
		RawKind string `json:"raw_kind"`
	}
	if err := json.Unmarshal(got[2].Properties, &unknown); err != nil || unknown.RawKind != "a_step_from_later" {
		t.Fatalf("the unrecognised step kept %q (%v), want a_step_from_later", unknown.RawKind, err)
	}
	if !got[0].OccurredAt.Equal(at.Add(65 * time.Second)) {
		t.Fatalf("landed at %s, want the block time", got[0].OccurredAt)
	}
	var preflight struct {
		Conditions struct {
			PolicyVersion string `json:"policy_version"`
			Legs          []struct {
				Decision string
				Reasons  []struct{ Code string }
			}
		}
	}
	if err := json.Unmarshal(got[3].Properties, &preflight); err != nil {
		t.Fatal(err)
	}
	if c := preflight.Conditions; c.PolicyVersion != "policy-2026.10.1" || len(c.Legs) != 1 || c.Legs[0].Decision != "WARN" || c.Legs[0].Reasons[0].Code != "ISSUER_CAN_FREEZE" {
		t.Fatalf("preflight.run carries %+v, want what the policy stated", c)
	}
}

func TestAQuoteRecordedWithoutConditionsSaysSoRatherThanNone(t *testing.T) {
	events, report, _ := fresh(t)
	quoteID := [16]byte{1}
	if err := report.RecordQuote(context.Background(), execution.Quote{
		ID: quoteID, Wallet: holder, Network: "mainnet", Kind: "buy", PlanSize: 1, Deployment: "production", PreparedAt: at,
		Refusal: &execution.Refusal{Status: 400, Text: "The Allocation names a constituent more than once."},
	}); err != nil {
		t.Fatal(err)
	}
	projectAll(t, events, report, 1)
	got := timeline(t, events)
	var properties map[string]json.RawMessage
	if err := json.Unmarshal(got[0].Properties, &properties); err != nil {
		t.Fatal(err)
	}
	if string(properties["conditions"]) != "null" {
		t.Fatalf("conditions: got %s, want null, unknown rather than none", properties["conditions"])
	}
}

func TestProjectingAgainOrFromTheStartWritesTheSameEventsOnce(t *testing.T) {
	events, report, pool := fresh(t)
	ctx := context.Background()
	record(t, report, pool)
	projectAll(t, events, report, 5)
	before := timeline(t, events)
	if written, err := events.Project(ctx, report, at); err != nil || written != 0 {
		t.Fatalf("projecting again: wrote %d (%v), want 0", written, err)
	}
	// From the start: the cursor gone, every event offered again.
	if _, err := pool.Exec(ctx, "DELETE FROM growth.cursors"); err != nil {
		t.Fatal(err)
	}
	if written, err := events.Project(ctx, report, at); err != nil || written != 0 {
		t.Fatalf("projecting from the start over the same events: wrote %d (%v), want 0", written, err)
	}
	// Rebuilt: the projection emptied and projected again.
	if _, err := pool.Exec(ctx, "DELETE FROM growth.events; DELETE FROM growth.cursors"); err != nil {
		t.Fatal(err)
	}
	if written := projectAll(t, events, report, 5); written != 5 {
		t.Fatalf("rebuilding: wrote %d, want 5", written)
	}
	after := timeline(t, events)
	for i := range before {
		if before[i].Type != after[i].Type || before[i].OriginKey != after[i].OriginKey || !before[i].OccurredAt.Equal(after[i].OccurredAt) || string(before[i].Properties) != string(after[i].Properties) {
			t.Fatalf("event %d differs after a rebuild: %+v, then %+v", i, before[i], after[i])
		}
	}
}

// fakeOutbox answers fixed events once, as Execution's outbox would.
type fakeOutbox struct{ events []execution.OutboxEvent }

func (f *fakeOutbox) OutboxSince(_ context.Context, cursor execution.OutboxCursor, _ int) ([]execution.OutboxEvent, error) {
	var out []execution.OutboxEvent
	for _, event := range f.events {
		if event.ID > cursor.ID {
			out = append(out, event)
		}
	}
	return out, nil
}

func TestAnOutboxKindOrOutcomeThisCodeDoesNotKnowIsKeptNotDropped(t *testing.T) {
	events, _, _ := fresh(t)
	outbox := &fakeOutbox{events: []execution.OutboxEvent{
		{ID: 1, Kind: "execution.repriced", Wallet: holder, Payload: json.RawMessage(`{"deployment":"production"}`), OccurredAt: at, Cursor: execution.OutboxCursor{XID: "10", ID: 1}},
		{ID: 2, Kind: "execution.settled", Wallet: holder, Payload: json.RawMessage(`{"outcome":"expired","deployment":"production"}`), OccurredAt: at.Add(time.Second), Cursor: execution.OutboxCursor{XID: "11", ID: 2}},
	}}
	if written, err := events.Project(context.Background(), outbox, at); err != nil || written != 2 {
		t.Fatalf("projecting: wrote %d (%v), want 2", written, err)
	}
	got := timeline(t, events)
	if len(got) != 2 || got[0].Type != "leg.unrecognised" || got[1].Type != "outbox.unrecognised" {
		t.Fatalf("timeline: got %+v", got)
	}
	var kind, outcome struct {
		OutboxKind string `json:"outbox_kind"`
		Outcome    string `json:"outcome"`
	}
	if err := json.Unmarshal(got[1].Properties, &kind); err != nil || kind.OutboxKind != "execution.repriced" {
		t.Fatalf("the unknown kind kept %q (%v), want execution.repriced", kind.OutboxKind, err)
	}
	if err := json.Unmarshal(got[0].Properties, &outcome); err != nil || outcome.Outcome != "expired" {
		t.Fatalf("the unknown outcome kept %q (%v), want expired", outcome.Outcome, err)
	}
}

func TestExpiredProjectedFunnelStepsAreDeletedAndNothingElse(t *testing.T) {
	events, report, pool := fresh(t)
	ctx := context.Background()
	record(t, report, pool)
	projectAll(t, events, report, 5)
	deleted, err := events.ForgetFunnelBefore(ctx, at.Add(time.Hour))
	if err != nil || deleted != 2 {
		t.Fatalf("deleted %d (%v), want the 2 funnel steps", deleted, err)
	}
	for _, event := range timeline(t, events) {
		if event.Source == "client" {
			t.Fatalf("a funnel step survived: %s", event.Type)
		}
	}
	if n := len(timeline(t, events)); n != 3 {
		t.Fatalf("events left: got %d, want 3", n)
	}
}

// The plan's acceptance for milestone 1a: one wallet's timeline reads in
// under 100 ms among 3,000,000 events.
func TestOneWalletsTimelineReadsQuicklyAmongMillionsOfEvents(t *testing.T) {
	if testing.Short() {
		t.Skip("seeds 3,000,000 events")
	}
	events, _, pool := fresh(t)
	ctx := context.Background()
	// 30,000 wallets of 100 events each. An md5 is 32 hex characters; a 0
	// is not base58, so it becomes a z. Seeded in short transactions: one
	// long one would hold back every other package's outbox reads on the
	// same Postgres for as long as it ran.
	for from := 1; from <= 3_000_000; from += 100_000 {
		if _, err := pool.Exec(ctx, `
			INSERT INTO growth.events (type, wallet, properties, source, deployment, origin, origin_key, occurred_at)
			SELECT 'preflight.run', translate(md5((n % 30000)::text), '0', 'z'), '{}', 'server', 'production', 'seed', n::text,
			       timestamptz '2026-01-01' + n * interval '7 seconds'
			FROM generate_series($1::int, $1::int + 99999) AS n`, from); err != nil {
			t.Fatalf("seeding from %d: %v", from, err)
		}
	}
	if _, err := pool.Exec(ctx, "ANALYZE growth.events"); err != nil {
		t.Fatal(err)
	}
	var wallet string
	if err := pool.QueryRow(ctx, "SELECT translate(md5('12345'), '0', 'z')").Scan(&wallet); err != nil {
		t.Fatal(err)
	}
	var plan strings.Builder
	rows, err := pool.Query(ctx, "EXPLAIN SELECT id FROM growth.events WHERE wallet = $1 AND occurred_at < $2 ORDER BY occurred_at DESC, id DESC LIMIT 50", wallet, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			t.Fatal(err)
		}
		plan.WriteString(line + "\n")
	}
	rows.Close()
	if !strings.Contains(plan.String(), "events_wallet_timeline") {
		t.Fatalf("the timeline does not read through its index:\n%s", plan.String())
	}
	start := time.Now()
	got, err := events.Timeline(ctx, wallet, time.Now(), 50)
	elapsed := time.Since(start)
	if err != nil || len(got) != 50 {
		t.Fatalf("timeline: %d events (%v), want 50", len(got), err)
	}
	t.Logf("one wallet's 50 newest of 3,000,000 events in %s", elapsed)
	if elapsed > 100*time.Millisecond {
		t.Fatalf("one wallet's timeline took %s; the plan's bound is 100 ms", elapsed)
	}
}
