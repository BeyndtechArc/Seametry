-- name: Cursor :one
SELECT after_xid, after_id FROM growth.cursors WHERE origin = $1;

-- name: AdvanceCursor :exec
INSERT INTO growth.cursors (origin, after_xid, after_id, advanced_at)
VALUES ($1, $2, $3, $4)
ON CONFLICT (origin) DO UPDATE SET after_xid = EXCLUDED.after_xid, after_id = EXCLUDED.after_id, advanced_at = EXCLUDED.advanced_at;

-- name: InsertEvent :execrows
-- An event already projected from the same origin row changes nothing.
INSERT INTO growth.events (type, wallet, properties, source, deployment, origin, origin_key, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (origin, origin_key) DO NOTHING;

-- name: WalletTimeline :many
-- One wallet's events before a time, newest first.
SELECT id, type, wallet, properties, source, deployment, origin, origin_key, occurred_at, received_at
FROM growth.events
WHERE wallet = sqlc.arg(wallet) AND occurred_at < sqlc.arg(before)
ORDER BY occurred_at DESC, id DESC
LIMIT sqlc.arg(row_limit);

-- name: DeleteProjectedFunnelBefore :execrows
-- Funnel steps are kept 24 months (the privacy policy); their projections
-- go with them. Every 'client' event from the execution outbox is a funnel
-- step.
DELETE FROM growth.events
WHERE origin = 'execution.outbox' AND source = 'client' AND occurred_at < $1;
