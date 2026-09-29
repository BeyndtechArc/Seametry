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
-- as_of is never optional here: every caller passes now() when the request
-- itself did not name one (docs/prd/API.md section 4.5, "omitted means
-- now"), so this one query answers both cases and "what did Seametry know
-- at time T" is never silently collapsed to "what does it know now".
SELECT * FROM observation.observations
WHERE mint = $1 AND source = $2 AND source_event_at <= $3
ORDER BY source_event_at DESC
LIMIT 1;

-- name: LatestObservationsPerRequestKey :many
-- One row per distinct request_key as of the given instant: the depth
-- curve for a mint is one observation per size queried
-- (adapter_jupiter.go's request_key is mint@size), and DISTINCT ON with
-- this ORDER BY keeps only the latest of however many times that size has
-- been observed at or before as_of.
SELECT DISTINCT ON (request_key) *
FROM observation.observations
WHERE mint = $1 AND source = $2 AND source_event_at <= $3
ORDER BY request_key, source_event_at DESC;

-- name: ListMintsWithObservations :many
SELECT DISTINCT mint FROM observation.observations WHERE source = $1 ORDER BY mint;

-- name: GetRawPayload :one
SELECT * FROM observation.raw_payloads WHERE digest = $1;
