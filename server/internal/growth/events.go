// Package growth owns the GTM Admin's record (docs/SERVICE_CATALOG.md
// section 3.13; .plan/gtm-admin.plan.md): one timeline of events per
// wallet, projected from other services' outboxes. It writes only the
// growth schema and reads other services only through their interfaces.
package growth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/execution"
	"github.com/BeyndtechArc/Seametry/server/internal/store/growthdb"
)

// ExecutionOrigin names the execution outbox in each projected event and
// in the cursor that resumes reading it.
const ExecutionOrigin = "execution.outbox"

// batch is how many outbox events one projection step reads; the loop
// steps again at once while a step comes back full.
const batch = 500

// Outbox is the execution record's outbox as Growth reads it.
// *execution.Report satisfies it.
type Outbox interface {
	OutboxSince(ctx context.Context, cursor execution.OutboxCursor, limit int) ([]execution.OutboxEvent, error)
}

type beginner interface {
	growthdb.DBTX
	Begin(ctx context.Context) (pgx.Tx, error)
}

// Events is the projection's writer and reader. *pgxpool.Pool satisfies db.
type Events struct {
	db beginner
	q  *growthdb.Queries
}

func NewEvents(db beginner) *Events {
	return &Events{db: db, q: growthdb.New(db)}
}

// Event is one entry of a wallet's timeline.
type Event struct {
	ID         int64
	Type       string
	Wallet     string
	Properties json.RawMessage
	// Source is whose word the event is: server, client, chain, mail,
	// import or admin. Only a chain event says something settled.
	Source     string
	Deployment string
	Origin     string
	OriginKey  string
	OccurredAt time.Time
	ReceivedAt time.Time
}

// funnelTypes names each step a browser reports in the brief's noun.verb.
var funnelTypes = map[string]string{
	"wallet_connected":    "wallet.connected",
	"review_opened":       "review.opened",
	"signature_requested": "signature.requested",
	"signature_declined":  "signature.declined",
	"signature_failed":    "signature.failed",
	"sheet_abandoned":     "review.abandoned",
	"unrecognised":        "funnel.unrecognised",
}

var settledOutcomes = map[string]bool{"landed": true, "failed": true, "dropped": true}

// payload is the union of the fields the execution outbox writes.
type payload struct {
	QuoteID       string `json:"quote_id,omitempty"`
	LegID         string `json:"leg_id,omitempty"`
	FunnelID      int64  `json:"funnel_id,omitempty"`
	Kind          string `json:"kind,omitempty"`
	RawKind       string `json:"raw_kind,omitempty"`
	Network       string `json:"network,omitempty"`
	Outcome       string `json:"outcome,omitempty"`
	Result        string `json:"result,omitempty"`
	RefusalStatus *int   `json:"refusal_status,omitempty"`
	PlanSize      int    `json:"plan_size,omitempty"`
	Subject       string `json:"subject,omitempty"`
	TemplateID    string `json:"template_id,omitempty"`
	Symbol        string `json:"symbol,omitempty"`
	Mint          string `json:"mint,omitempty"`
	Deployment    string `json:"deployment,omitempty"`
	Source        string `json:"source,omitempty"`
}

// project names one outbox event as a timeline event. An outbox kind this
// code does not know is kept as outbox.unrecognised with the kind it came
// as, never dropped (AGENTS.md, Uncertainty).
func project(event execution.OutboxEvent) (growthdb.InsertEventParams, error) {
	var p payload
	if err := json.Unmarshal(event.Payload, &p); err != nil {
		return growthdb.InsertEventParams{}, fmt.Errorf("growth: outbox event %d carries a payload that is not JSON: %w", event.ID, err)
	}
	var kind, source string
	var properties any
	switch event.Kind {
	case "execution.quoted":
		kind, source = "preflight.run", p.Source
		properties = map[string]any{"quote_id": p.QuoteID, "kind": p.Kind, "network": p.Network, "result": p.Outcome,
			"refusal_status": p.RefusalStatus, "plan_size": p.PlanSize, "subject": p.Subject, "template_id": p.TemplateID}
	case "execution.sent":
		kind, source = "leg.sent", p.Source
		properties = map[string]any{"leg_id": p.LegID, "quote_id": p.QuoteID, "kind": p.Kind, "symbol": p.Symbol, "mint": p.Mint, "result": p.Result}
	case "execution.settled":
		// What settled is the chain's word whoever recorded the leg; who
		// recorded it is kept beside it. An outcome this code does not know
		// would make a type the table refuses, and that one row would stop
		// the projection for good.
		kind, source = "leg."+p.Outcome, "chain"
		if !settledOutcomes[p.Outcome] {
			kind = "leg.unrecognised"
		}
		properties = map[string]any{"leg_id": p.LegID, "quote_id": p.QuoteID, "kind": p.Kind, "symbol": p.Symbol, "mint": p.Mint, "outcome": p.Outcome, "recorded_by": p.Source}
	case "execution.funnel_step":
		name, known := funnelTypes[p.Kind]
		if !known {
			name = "funnel.unrecognised"
		}
		kind, source = name, "client"
		properties = map[string]any{"funnel_id": p.FunnelID, "step": p.Kind, "raw_kind": p.RawKind, "quote_id": p.QuoteID}
	default:
		kind, source = "outbox.unrecognised", "server"
		properties = map[string]any{"outbox_kind": event.Kind, "payload": event.Payload}
	}
	encoded, err := json.Marshal(properties)
	if err != nil {
		return growthdb.InsertEventParams{}, fmt.Errorf("growth: encoding outbox event %d: %w", event.ID, err)
	}
	return growthdb.InsertEventParams{
		Type: kind, Wallet: pgtype.Text{String: event.Wallet, Valid: event.Wallet != ""}, Properties: encoded, Source: source,
		Deployment: pgtype.Text{String: p.Deployment, Valid: p.Deployment != ""},
		Origin:     ExecutionOrigin, OriginKey: strconv.FormatInt(event.ID, 10),
		OccurredAt: pgtype.Timestamptz{Time: event.OccurredAt.UTC(), Valid: true},
	}, nil
}

// Project reads the execution outbox from where it last stopped and writes
// the events, the cursor moving in the same transaction, so a crash between
// the two cannot lose or repeat an event. It answers how many events it
// wrote, and steps again while the outbox has more.
func (e *Events) Project(ctx context.Context, outbox Outbox, now time.Time) (written int, err error) {
	for {
		n, full, err := e.step(ctx, outbox, now)
		written += n
		if err != nil || !full {
			return written, err
		}
	}
}

func (e *Events) step(ctx context.Context, outbox Outbox, now time.Time) (written int, full bool, err error) {
	cursor := execution.OutboxCursor{XID: "0"}
	stored, err := e.q.Cursor(ctx, ExecutionOrigin)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		return 0, false, fmt.Errorf("growth: reading the %s cursor: %w", ExecutionOrigin, err)
	default:
		cursor = execution.OutboxCursor{XID: stored.AfterXid, ID: stored.AfterID}
	}
	events, err := outbox.OutboxSince(ctx, cursor, batch)
	if err != nil {
		return 0, false, fmt.Errorf("growth: reading the execution outbox: %w", err)
	}
	if len(events) == 0 {
		return 0, false, nil
	}
	rows := make([]growthdb.InsertEventParams, len(events))
	for i, event := range events {
		if rows[i], err = project(event); err != nil {
			return 0, false, err
		}
	}
	tx, err := e.db.Begin(ctx)
	if err != nil {
		return 0, false, fmt.Errorf("growth: opening the projection transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	q := e.q.WithTx(tx)
	for _, row := range rows {
		inserted, err := q.InsertEvent(ctx, row)
		if err != nil {
			return 0, false, fmt.Errorf("growth: writing %s from outbox row %s: %w", row.Type, row.OriginKey, err)
		}
		written += int(inserted)
	}
	last := events[len(events)-1].Cursor
	if err = q.AdvanceCursor(ctx, growthdb.AdvanceCursorParams{
		Origin: ExecutionOrigin, AfterXid: last.XID, AfterID: last.ID, AdvancedAt: pgtype.Timestamptz{Time: now.UTC(), Valid: true},
	}); err != nil {
		return 0, false, fmt.Errorf("growth: moving the %s cursor: %w", ExecutionOrigin, err)
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, false, fmt.Errorf("growth: committing the projection: %w", err)
	}
	return written, len(events) == batch, nil
}

// Timeline answers one wallet's events before a time, newest first, at
// most limit of them.
func (e *Events) Timeline(ctx context.Context, wallet string, before time.Time, limit int) ([]Event, error) {
	if limit < 1 || limit > 200 {
		return nil, fmt.Errorf("growth: a timeline of %d events was asked for; 1 to 200 are answered", limit)
	}
	rows, err := e.q.WalletTimeline(ctx, growthdb.WalletTimelineParams{
		Wallet: pgtype.Text{String: wallet, Valid: true}, Before: pgtype.Timestamptz{Time: before.UTC(), Valid: true}, RowLimit: int32(limit),
	})
	if err != nil {
		return nil, fmt.Errorf("growth: reading the timeline of %s: %w", wallet, err)
	}
	events := make([]Event, len(rows))
	for i, row := range rows {
		events[i] = Event{
			ID: row.ID, Type: row.Type, Wallet: row.Wallet.String, Properties: row.Properties, Source: row.Source,
			Deployment: row.Deployment.String, Origin: row.Origin, OriginKey: row.OriginKey,
			OccurredAt: row.OccurredAt.Time.UTC(), ReceivedAt: row.ReceivedAt.Time.UTC(),
		}
	}
	return events, nil
}

// ForgetFunnelBefore deletes projected funnel steps received before cutoff,
// the retention the privacy policy states for the steps themselves.
func (e *Events) ForgetFunnelBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	deleted, err := e.q.DeleteProjectedFunnelBefore(ctx, pgtype.Timestamptz{Time: cutoff.UTC(), Valid: true})
	if err != nil {
		return 0, fmt.Errorf("growth: deleting projected funnel steps before %s: %w", cutoff.Format(time.DateOnly), err)
	}
	return deleted, nil
}
