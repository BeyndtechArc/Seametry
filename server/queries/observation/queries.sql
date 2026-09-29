-- name: InsertRawPayload :exec
INSERT INTO observation.raw_payloads (digest, source, adapter_version, source_event_at, received_at, persisted_at, object_key)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (digest) DO NOTHING;

-- name: InsertObservation :one
-- DO UPDATE with a no-op assignment, not DO NOTHING: RETURNING produces zero
-- rows on a DO NOTHING conflict, and this query's caller (store.Ingest)
-- needs the row's id whether this call inserted it or a replay already had.
INSERT INTO observation.observations (source_event_at, received_at, persisted_at, source, adapter_version, verification_state, raw_digest, mint, request_key, payload)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (source, request_key, source_event_at) DO UPDATE SET raw_digest = EXCLUDED.raw_digest
RETURNING id;

-- name: LatestObservationForMint :one
SELECT * FROM observation.observations
WHERE mint = $1 AND source = $2
ORDER BY source_event_at DESC
LIMIT 1;

-- name: GetRawPayload :one
SELECT * FROM observation.raw_payloads WHERE digest = $1;
