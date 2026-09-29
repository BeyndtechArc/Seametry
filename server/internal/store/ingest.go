package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/store/observationdb"
)

// IngestInput is one adapter's capture, ready to be written raw-then-
// normalized (docs/ENGINEERING_STANDARD.md section 5). An adapter (this
// file's siblings: adapter_solana.go, adapter_jupiter.go) produces these;
// Ingest persists them.
type IngestInput struct {
	Mint              string
	Source            string
	AdapterVersion    string
	SourceEventAt     time.Time
	ReceivedAt        time.Time
	VerificationState string
	Raw               []byte
	Payload           []byte // normalized JSON
}

// Ingest writes in's raw bytes to objects, keyed by their own SHA-256, then
// records the raw payload and the normalized observation in Postgres. Raw
// storage happens first and is what "ingestion fails when the object store
// is unavailable" (docs/ENGINEERING_STANDARD.md section 5) means in code: a
// failed Put returns before either table is touched, so a failure here
// leaves no half-written row implying evidence exists that does not.
func Ingest(ctx context.Context, objects ObjectStore, queries *observationdb.Queries, in IngestInput) error {
	sum := sha256.Sum256(in.Raw)
	digest := hex.EncodeToString(sum[:])

	if err := objects.Put(ctx, digest, in.Raw); err != nil {
		return fmt.Errorf("store: raw capture failed, not persisting an observation for it: %w", err)
	}

	persistedAt := time.Now().UTC()
	err := queries.InsertRawPayload(ctx, observationdb.InsertRawPayloadParams{
		Digest:         digest,
		Source:         in.Source,
		AdapterVersion: in.AdapterVersion,
		SourceEventAt:  toTimestamptz(in.SourceEventAt),
		ReceivedAt:     toTimestamptz(in.ReceivedAt),
		PersistedAt:    toTimestamptz(persistedAt),
		ObjectKey:      digest,
	})
	if err != nil {
		return fmt.Errorf("store: indexing the raw payload for %s: %w", in.Mint, err)
	}

	_, err = queries.InsertObservation(ctx, observationdb.InsertObservationParams{
		SourceEventAt:     toTimestamptz(in.SourceEventAt),
		ReceivedAt:        toTimestamptz(in.ReceivedAt),
		PersistedAt:       toTimestamptz(persistedAt),
		Source:            in.Source,
		AdapterVersion:    in.AdapterVersion,
		VerificationState: in.VerificationState,
		RawDigest:         digest,
		Mint:              in.Mint,
		Payload:           in.Payload,
	})
	if err != nil {
		return fmt.Errorf("store: recording the observation for %s: %w", in.Mint, err)
	}
	return nil
}

func toTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}
