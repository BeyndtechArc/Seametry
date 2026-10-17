-- name: TouchWallet :exec
-- The wallet's first quote creates it, and a trade imported from chain that
-- predates it moves first_seen_at back. A first-touch source arriving later
-- fills an empty one and never replaces one already kept.
INSERT INTO execution.wallets (address, first_seen_at, first_source, first_source_at)
VALUES (sqlc.arg(address), sqlc.arg(seen_at), sqlc.narg(first_source), CASE WHEN sqlc.narg(first_source)::jsonb IS NULL THEN NULL ELSE sqlc.arg(seen_at)::timestamptz END)
ON CONFLICT (address) DO UPDATE SET
    first_seen_at   = LEAST(execution.wallets.first_seen_at, EXCLUDED.first_seen_at),
    first_source    = COALESCE(execution.wallets.first_source, EXCLUDED.first_source),
    first_source_at = COALESCE(execution.wallets.first_source_at, EXCLUDED.first_source_at);

-- name: InsertQuote :execrows
-- A retried report carries the same id and changes nothing.
INSERT INTO execution.quotes (
    id, wallet, network, kind, subject, template_id, plan_size, deployment,
    prepared_at, outcome, refusal_status, refusal_text, source
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
)
ON CONFLICT (id) DO NOTHING;

-- name: InsertLeg :exec
INSERT INTO execution.legs (
    id, quote_id, wallet, mint, symbol, in_atoms, in_scale, out_atoms,
    floor_atoms, out_scale, routing_fee_bps, tip_offset_bps,
    simulated_fee_atoms, tip_lamports, landing, last_valid_block_height,
    message_sha256, source
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
)
ON CONFLICT (id) DO NOTHING;

-- name: RecordSubmission :execrows
-- The first submission of a leg is kept. A second report for the same
-- message, a retry or a duplicate request, changes nothing.
UPDATE execution.legs
SET signature = sqlc.narg(signature), submitted_at = sqlc.arg(submitted_at),
    submit_result = sqlc.arg(submit_result), submit_text = sqlc.narg(submit_text)
WHERE message_sha256 = sqlc.arg(message_sha256) AND submit_result IS NULL;

-- name: InsertFunnelEvent :exec
INSERT INTO execution.funnel_events (kind, raw_kind, wallet, quote_id, deployment, received_at, source)
VALUES ($1, $2, $3, $4, $5, $6, 'client');
