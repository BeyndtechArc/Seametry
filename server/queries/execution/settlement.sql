-- name: UnsettledLegs :many
-- Sent legs the chain has not yet answered for, oldest first. A leg refused
-- before broadcast reached nothing, so there is nothing to ask about it.
SELECT l.id, l.wallet, l.mint, l.symbol, l.signature, l.last_valid_block_height
FROM execution.legs l
WHERE l.signature IS NOT NULL AND l.chain_outcome IS NULL AND l.submit_result <> 'refused_not_sent'
ORDER BY l.submitted_at
LIMIT 256;

-- name: SettleLeg :execrows
-- Only an unsettled leg is settled: the chain's first answer stands, and
-- writes the one outbox row. The count is the outbox rows written.
WITH settled AS (
    UPDATE execution.legs SET
        chain_outcome = sqlc.arg(chain_outcome), slot = sqlc.narg(slot), block_time = sqlc.narg(block_time),
        chain_error = sqlc.narg(chain_error), network_fee_lamports = sqlc.narg(network_fee_lamports),
        wallet_usdc_delta = sqlc.narg(wallet_usdc_delta), wallet_token_delta = sqlc.narg(wallet_token_delta),
        token_scale = sqlc.narg(token_scale), fee_credited_atoms = sqlc.narg(fee_credited_atoms),
        reconciled_at = sqlc.arg(reconciled_at)
    WHERE execution.legs.id = sqlc.arg(id) AND execution.legs.chain_outcome IS NULL
    RETURNING *
)
INSERT INTO execution.outbox (kind, wallet, payload, occurred_at)
SELECT 'execution.settled', s.wallet, jsonb_build_object(
           'leg_id', s.id, 'quote_id', s.quote_id, 'kind', q.kind, 'symbol', s.symbol, 'mint', s.mint,
           'outcome', s.chain_outcome, 'deployment', q.deployment, 'source', s.source),
       COALESCE(s.block_time, s.reconciled_at)
FROM settled s JOIN execution.quotes q ON q.id = s.quote_id;

-- name: LandedLegsForWallet :one
SELECT count(*) FROM execution.legs WHERE wallet = $1 AND chain_outcome = 'landed';

-- name: LegWithSignature :one
SELECT EXISTS (SELECT 1 FROM execution.legs WHERE signature = $1);

-- name: InsertImportedQuote :exec
-- One quote per imported leg: which plan it belonged to was never recorded.
INSERT INTO execution.quotes (id, wallet, network, kind, plan_size, deployment, prepared_at, outcome, source)
VALUES ($1, $2, 'mainnet', $3, 1, 'production', $4, 'prepared', 'chain')
ON CONFLICT (id) DO NOTHING;

-- name: InsertImportedLeg :exec
WITH imported AS (
INSERT INTO execution.legs (
    id, quote_id, wallet, mint, symbol, message_sha256, signature, submitted_at, submit_result, source,
    chain_outcome, slot, block_time, chain_error, network_fee_lamports, wallet_usdc_delta,
    wallet_token_delta, token_scale, fee_credited_atoms, reconciled_at
) VALUES (
    sqlc.arg(id), sqlc.arg(quote_id), sqlc.arg(wallet), sqlc.arg(mint), sqlc.narg(symbol), sqlc.arg(message_sha256),
    sqlc.arg(signature), sqlc.arg(block_time), 'sent', 'chain', sqlc.arg(chain_outcome), sqlc.arg(slot),
    sqlc.arg(block_time), sqlc.narg(chain_error), sqlc.arg(network_fee_lamports), sqlc.arg(wallet_usdc_delta),
    sqlc.arg(wallet_token_delta), sqlc.arg(token_scale), sqlc.arg(fee_credited_atoms), sqlc.arg(reconciled_at)
)
-- Also on message_sha256: a leg the server recorded whose submission report
-- was lost carries the same message, and the server's row is kept, and the
-- outbox row is the server leg's own when it settles.
ON CONFLICT DO NOTHING
RETURNING *
)
INSERT INTO execution.outbox (kind, wallet, payload, occurred_at)
SELECT 'execution.settled', l.wallet, jsonb_build_object(
           'leg_id', l.id, 'quote_id', l.quote_id, 'kind', q.kind, 'symbol', l.symbol, 'mint', l.mint,
           'outcome', l.chain_outcome, 'deployment', q.deployment, 'source', l.source),
       COALESCE(l.block_time, l.reconciled_at)
FROM imported l JOIN execution.quotes q ON q.id = l.quote_id;

-- name: DeleteFunnelEventsBefore :execrows
-- The privacy policy keeps funnel steps 24 months, and their outbox rows go
-- with them. The count is the funnel steps deleted.
WITH outboxed AS (
    DELETE FROM execution.outbox WHERE kind = 'execution.funnel_step' AND occurred_at < $1
)
DELETE FROM execution.funnel_events WHERE received_at < $1;

-- name: OutboxSince :many
-- Rows after the cursor, oldest transaction first, written only by
-- transactions older than every one still running, so no row can later
-- appear behind the cursor. xid travels as text, which xid8 converts to
-- and from exactly, so the cursor is one opaque string to the caller.
SELECT o.id, o.xid::text AS xid, o.kind, o.wallet, o.payload, o.occurred_at
FROM execution.outbox o
WHERE (o.xid, o.id) > (sqlc.arg(after_xid)::text::xid8, sqlc.arg(after_id)::bigint)
  AND o.xid < pg_snapshot_xmin(pg_current_snapshot())
ORDER BY o.xid, o.id
LIMIT sqlc.arg(row_limit);
