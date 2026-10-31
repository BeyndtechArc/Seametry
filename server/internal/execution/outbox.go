package execution

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/store/executiondb"
)

// OutboxEvent is one change the activity record made, as another service
// reads it: what happened, to which wallet, when, and the record's own keys
// in Payload. No amount travels in it.
type OutboxEvent struct {
	ID         int64
	Kind       string
	Wallet     string
	Payload    json.RawMessage
	OccurredAt time.Time
	// Cursor is where a reader resumes after this event.
	Cursor OutboxCursor
}

// OutboxCursor is a reader's place in the outbox: the writing transaction
// and the row. The zero cursor starts from the first event.
type OutboxCursor struct {
	XID string
	ID  int64
}

// OutboxSince answers up to limit events after cursor, in the order their
// transactions began, and only events no running transaction can still
// precede, so resuming from the last event's cursor never skips one.
func (r *Report) OutboxSince(ctx context.Context, cursor OutboxCursor, limit int) ([]OutboxEvent, error) {
	if limit < 1 || limit > 1000 {
		return nil, Invalid{fmt.Sprintf("limit %d is outside 1 to 1000", limit)}
	}
	after := cursor.XID
	if after == "" {
		after = "0"
	}
	rows, err := r.q.OutboxSince(ctx, executiondb.OutboxSinceParams{AfterXid: after, AfterID: cursor.ID, RowLimit: int32(limit)})
	if err != nil {
		return nil, fmt.Errorf("execution: reading the outbox after %s/%d: %w", after, cursor.ID, err)
	}
	events := make([]OutboxEvent, len(rows))
	for i, row := range rows {
		events[i] = OutboxEvent{
			ID: row.ID, Kind: row.Kind, Wallet: row.Wallet.String, Payload: row.Payload, OccurredAt: row.OccurredAt.Time.UTC(),
			Cursor: OutboxCursor{XID: row.Xid, ID: row.ID},
		}
	}
	return events, nil
}
