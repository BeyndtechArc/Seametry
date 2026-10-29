-- name: TouchWallet :exec
-- The wallet's first quote creates it, and a trade imported from chain that
-- predates it moves first_seen_at back. The first quote decides the source,
-- with or without one (first_source_at set, first_source NULL is an explicit
-- unknown); a chain import decides nothing; once decided it never changes.
INSERT INTO execution.wallets (address, first_seen_at, first_source, first_source_at)
VALUES (sqlc.arg(address), sqlc.arg(seen_at), sqlc.narg(first_source), CASE WHEN sqlc.arg(decides_source)::boolean THEN sqlc.arg(seen_at)::timestamptz END)
ON CONFLICT (address) DO UPDATE SET
    first_seen_at   = LEAST(execution.wallets.first_seen_at, EXCLUDED.first_seen_at),
    first_source    = CASE WHEN execution.wallets.first_source_at IS NULL THEN EXCLUDED.first_source ELSE execution.wallets.first_source END,
    first_source_at = COALESCE(execution.wallets.first_source_at, EXCLUDED.first_source_at);

-- name: InsertQuote :execrows
-- A retried report carries the same id and changes nothing, and writes no
-- second outbox row. The count is the outbox rows written, one per quote
-- inserted.
WITH inserted AS (
    INSERT INTO execution.quotes (
        id, wallet, network, kind, subject, template_id, plan_size, deployment,
        prepared_at, outcome, refusal_status, refusal_text, source
    ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING *
)
INSERT INTO execution.outbox (kind, wallet, payload, occurred_at)
SELECT 'execution.quoted', i.wallet, jsonb_build_object(
           'quote_id', i.id, 'kind', i.kind, 'network', i.network, 'outcome', i.outcome,
           'refusal_status', i.refusal_status, 'plan_size', i.plan_size, 'subject', i.subject,
           'template_id', i.template_id, 'deployment', i.deployment, 'source', i.source),
       i.prepared_at
FROM inserted i;

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
-- message, a retry or a duplicate request, changes nothing and writes no
-- outbox row. The count is the outbox rows written, one per leg updated.
WITH sent AS (
    UPDATE execution.legs
    SET signature = sqlc.narg(signature), submitted_at = sqlc.arg(submitted_at),
        submit_result = sqlc.arg(submit_result), submit_text = sqlc.narg(submit_text)
    WHERE message_sha256 = sqlc.arg(message_sha256) AND submit_result IS NULL
    RETURNING *
)
INSERT INTO execution.outbox (kind, wallet, payload, occurred_at)
SELECT 'execution.sent', s.wallet, jsonb_build_object(
           'leg_id', s.id, 'quote_id', s.quote_id, 'kind', q.kind, 'symbol', s.symbol, 'mint', s.mint,
           'result', s.submit_result, 'deployment', q.deployment, 'source', s.source),
       s.submitted_at
FROM sent s JOIN execution.quotes q ON q.id = s.quote_id;

-- name: InsertFunnelEvent :exec
WITH step AS (
    INSERT INTO execution.funnel_events (kind, raw_kind, wallet, quote_id, deployment, received_at, source)
    VALUES ($1, $2, $3, $4, $5, $6, 'client')
    RETURNING *
)
INSERT INTO execution.outbox (kind, wallet, payload, occurred_at)
SELECT 'execution.funnel_step', f.wallet, jsonb_build_object(
           'funnel_id', f.id, 'kind', f.kind, 'raw_kind', f.raw_kind, 'quote_id', f.quote_id,
           'deployment', f.deployment),
       f.received_at
FROM step f;

-- name: WalletHistory :many
-- The sent legs of the 200 most recent quotes for these wallets, newest
-- quote first. A leg never signed reached nobody, so it is not history.
WITH recent AS (
    SELECT q.id
    FROM execution.quotes q
    WHERE q.wallet = ANY(sqlc.arg(wallets)::text[])
      AND EXISTS (SELECT 1 FROM execution.legs s WHERE s.quote_id = q.id AND s.signature IS NOT NULL)
    ORDER BY q.prepared_at DESC
    LIMIT 200
)
SELECT q.id AS quote_id, q.wallet, q.kind, q.subject, q.template_id, q.plan_size, q.prepared_at, q.source AS quote_source,
       l.id AS leg_id, l.mint, l.symbol, l.in_atoms, l.in_scale, l.out_atoms, l.floor_atoms, l.out_scale,
       l.signature, l.submitted_at, l.submit_result, l.source AS leg_source,
       l.chain_outcome, l.block_time, l.wallet_usdc_delta, l.wallet_token_delta, l.token_scale, l.reconciled_at
FROM recent
JOIN execution.quotes q ON q.id = recent.id
JOIN execution.legs l ON l.quote_id = q.id AND l.signature IS NOT NULL
ORDER BY q.prepared_at DESC, q.id, l.id;
