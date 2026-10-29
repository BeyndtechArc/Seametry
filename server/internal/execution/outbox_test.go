package execution

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/store"
	"github.com/BeyndtechArc/Seametry/server/internal/store/executiondb"
)

// outboxHolding reads the outbox after cursor once it answers at least want
// events. Go runs packages in parallel against one Postgres, and a long
// writing transaction in any database on it holds the outbox back
// (docs/SERVICE_CATALOG.md section 3.6), so a test reads as the projector
// does: again, until the events are final.
func outboxHolding(t *testing.T, report *Report, cursor OutboxCursor, want int) []OutboxEvent {
	t.Helper()
	deadline := time.Now().Add(2 * time.Minute)
	for {
		events, err := report.OutboxSince(context.Background(), cursor, 100)
		if err != nil {
			t.Fatalf("reading the outbox: %v", err)
		}
		if len(events) >= want || time.Now().After(deadline) {
			return events
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func kinds(events []OutboxEvent) []string {
	out := make([]string, len(events))
	for i, event := range events {
		out[i] = event.Kind
	}
	return out
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestEachChangeToTheRecordWritesOneOutboxEventAndARepeatWritesNone(t *testing.T) {
	report, pool := freshReport(t)
	ctx := context.Background()
	quote := preparedQuote(t, nil)
	leg := quote.Legs[0]
	submission := Submission{MessageSHA256: leg.MessageSHA256, Signature: randomSignature(t), SubmittedAt: quote.PreparedAt.Add(time.Minute), Result: "sent"}
	for range 2 {
		if err := report.RecordQuote(ctx, quote); err != nil {
			t.Fatalf("recording the quote: %v", err)
		}
		if err := report.RecordSubmission(ctx, submission); err != nil {
			t.Fatalf("recording the submission: %v", err)
		}
	}
	if err := report.RecordFunnel(ctx, "production", []FunnelEvent{{Kind: "review_opened", Wallet: holder, QuoteID: &quote.ID}, {Kind: "a_step_from_later", Wallet: holder}}, quote.PreparedAt.Add(30*time.Second)); err != nil {
		t.Fatalf("recording funnel steps: %v", err)
	}
	for range 2 {
		if _, err := executiondb.New(pool).SettleLeg(ctx, executiondb.SettleLegParams{
			ID: pgtype.UUID{Bytes: leg.ID, Valid: true}, ChainOutcome: pgtype.Text{String: "landed", Valid: true},
			ReconciledAt: pgtype.Timestamptz{Time: quote.PreparedAt.Add(2 * time.Minute), Valid: true},
		}); err != nil {
			t.Fatalf("settling the leg: %v", err)
		}
	}

	events := outboxHolding(t, report, OutboxCursor{}, 5)
	want := []string{"execution.quoted", "execution.sent", "execution.funnel_step", "execution.funnel_step", "execution.settled"}
	if got := kinds(events); !equal(got, want) {
		t.Fatalf("outbox kinds: got %v, want %v", got, want)
	}
	var settled struct{ Outcome, Symbol, Deployment string }
	if err := json.Unmarshal(events[4].Payload, &settled); err != nil {
		t.Fatal(err)
	}
	if settled.Outcome != "landed" || settled.Symbol != "NVDAx" || settled.Deployment != "production" {
		t.Fatalf("settled payload: got %+v", settled)
	}
	if events[0].Wallet != holder || !events[0].OccurredAt.Equal(quote.PreparedAt) {
		t.Fatalf("quoted event: wallet %s at %s, want %s at %s", events[0].Wallet, events[0].OccurredAt, holder, quote.PreparedAt)
	}

	// Resuming from any event's cursor answers exactly the events after it.
	rest, err := report.OutboxSince(ctx, events[1].Cursor, 100)
	if err != nil {
		t.Fatal(err)
	}
	if got := kinds(rest); !equal(got, want[2:]) {
		t.Fatalf("after the second event: got %v, want %v", got, want[2:])
	}
	last, err := report.OutboxSince(ctx, events[4].Cursor, 100)
	if err != nil || len(last) != 0 {
		t.Fatalf("after the last event: got %d events (%v), want none", len(last), err)
	}
}

// A transaction that began first can commit after a later one. Identity
// values are handed out before commit, so the slow transaction's event can
// carry the lower id; a reader that had passed the later event by id would
// never see it. The outbox answers neither event until both are final.
func TestTheOutboxHoldsBackEventsARunningTransactionCouldStillPrecede(t *testing.T) {
	report, pool := freshReport(t)
	ctx := context.Background()
	at := time.Date(2026, 10, 29, 9, 0, 0, 0, time.UTC)
	slow, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = slow.Rollback(ctx) }()
	if err := executiondb.New(slow).InsertFunnelEvent(ctx, executiondb.InsertFunnelEventParams{
		Kind: "wallet_connected", Wallet: pgtype.Text{String: holder, Valid: true}, Deployment: "production", ReceivedAt: pgtype.Timestamptz{Time: at, Valid: true},
	}); err != nil {
		t.Fatalf("writing in the slow transaction: %v", err)
	}
	if err := report.RecordFunnel(ctx, "production", []FunnelEvent{{Kind: "review_opened", Wallet: holder}}, at.Add(time.Second)); err != nil {
		t.Fatalf("writing in the quick transaction: %v", err)
	}

	held, err := report.OutboxSince(ctx, OutboxCursor{}, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(held) != 0 {
		t.Fatalf("with the slow transaction running, got %d events, want none", len(held))
	}
	if err := slow.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	events := outboxHolding(t, report, OutboxCursor{}, 2)
	var steps []string
	for _, event := range events {
		var p struct{ Kind string }
		if err := json.Unmarshal(event.Payload, &p); err != nil {
			t.Fatal(err)
		}
		steps = append(steps, p.Kind)
	}
	if want := []string{"wallet_connected", "review_opened"}; !equal(steps, want) {
		t.Fatalf("once both are final: got %v, want %v", steps, want)
	}
}

func TestDeletingExpiredFunnelStepsDeletesTheirOutboxEvents(t *testing.T) {
	report, pool := freshReport(t)
	ctx := context.Background()
	old := time.Date(2024, 9, 1, 0, 0, 0, 0, time.UTC)
	if err := report.RecordFunnel(ctx, "production", []FunnelEvent{{Kind: "wallet_connected", Wallet: holder}}, old); err != nil {
		t.Fatal(err)
	}
	if err := report.RecordQuote(ctx, preparedQuote(t, nil)); err != nil {
		t.Fatal(err)
	}
	if _, err := report.ForgetFunnelBefore(ctx, time.Date(2024, 10, 29, 0, 0, 0, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.outbox WHERE kind = 'execution.funnel_step'"); n != 0 {
		t.Fatalf("funnel events left in the outbox: got %d, want 0", n)
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.outbox"); n != 1 {
		t.Fatalf("outbox events: got %d, want the quote's 1", n)
	}
}

// The outbox migration writes the record already kept as events, in the
// order it happened, so a reader starting after it sees the whole history.
func TestTheOutboxMigrationWritesTheRecordAlreadyKeptInOrder(t *testing.T) {
	dsn := freshDatabase(t)
	ctx := context.Background()
	db, err := store.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := store.Migrate(ctx, db, "execution", 4); err != nil {
		t.Fatalf("migrating execution to 4: %v", err)
	}
	quote, leg := id(t), id(t)
	for _, statement := range []struct {
		query string
		args  []any
	}{
		{"INSERT INTO execution.wallets (address, first_seen_at) VALUES ($1, '2026-10-20T09:00:00Z')", []any{holder}},
		{"INSERT INTO execution.funnel_events (kind, wallet, deployment, received_at, source) VALUES ('wallet_connected', $1, 'production', '2026-10-20T08:59:00Z', 'client')", []any{holder}},
		{"INSERT INTO execution.quotes (id, wallet, network, kind, plan_size, deployment, prepared_at, outcome, source) VALUES ($1, $2, 'mainnet', 'buy', 1, 'production', '2026-10-20T09:00:00Z', 'prepared', 'server')", []any{pgtype.UUID{Bytes: quote, Valid: true}, holder}},
		{`INSERT INTO execution.legs (id, quote_id, wallet, mint, symbol, in_atoms, in_scale, out_atoms, floor_atoms, out_scale, routing_fee_bps, tip_offset_bps,
		  simulated_fee_atoms, tip_lamports, landing, last_valid_block_height, message_sha256, signature, submitted_at, submit_result, source,
		  chain_outcome, block_time, reconciled_at)
		  VALUES ($1, $2, $3, $4, 'NVDAx', 1000000, 6, 450000, 445500, 8, 19, 6, 1900, 5000, 'sender', 435000000, $5, $6, '2026-10-20T09:01:00Z', 'sent', 'server',
		  'landed', '2026-10-20T09:01:05Z', '2026-10-20T09:02:00Z')`,
			[]any{pgtype.UUID{Bytes: leg, Valid: true}, pgtype.UUID{Bytes: quote, Valid: true}, holder, nvdax, digest(t), randomSignature(t)}},
	} {
		if _, err := db.ExecContext(ctx, statement.query, statement.args...); err != nil {
			t.Fatalf("writing the record as version 4 held it: %v", err)
		}
	}
	if _, err := store.Migrate(ctx, db, "execution", store.Latest); err != nil {
		t.Fatalf("migrating execution to the latest: %v", err)
	}
	pool, err := store.OpenPool(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	events := outboxHolding(t, NewReport(pool), OutboxCursor{}, 4)
	want := []string{"execution.funnel_step", "execution.quoted", "execution.sent", "execution.settled"}
	if got := kinds(events); !equal(got, want) {
		t.Fatalf("migrated outbox: got %v, want %v", got, want)
	}
	if !events[3].OccurredAt.Equal(time.Date(2026, 10, 20, 9, 1, 5, 0, time.UTC)) {
		t.Fatalf("settled at %s, want the block time", events[3].OccurredAt)
	}
}
