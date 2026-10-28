-- The Admin's reads (docs/prd/ADMIN.md owns what each figure means). Every
-- figure that counts money or an outcome reads only legs the chain answered
-- for; server rows say what was offered and sent, client rows are funnel
-- steps and never count as volume, a fee or an outcome. A period is
-- [period_from, period_to). One deployment at a time, so preview test trades
-- never mix into production figures.

-- name: AdminOverview :one
-- Volume is the USDC a landed leg moved for its wallet: what left it on a
-- buy, what arrived on a sale. A leg whose delta points the other way
-- counts 0 rather than subtracting. Tip cost is the fee forgone to cover a
-- tip, tip_offset_bps of that notional rounded down, so a leg found only on
-- chain, which carries no quoted tip offset, adds nothing to it.
WITH landed AS (
    SELECT l.wallet, l.fee_credited_atoms, l.tip_offset_bps,
           COALESCE(l.block_time, l.reconciled_at) AS at,
           GREATEST(0, CASE q.kind WHEN 'buy' THEN -l.wallet_usdc_delta ELSE l.wallet_usdc_delta END) AS notional
    FROM execution.legs l
    JOIN execution.quotes q ON q.id = l.quote_id
    WHERE l.chain_outcome = 'landed' AND q.deployment = sqlc.arg(deployment)
), first_landed AS (
    SELECT wallet, min(at) AS at FROM landed GROUP BY wallet
), seen AS (
    SELECT sq.wallet, min(sq.prepared_at) AS at FROM execution.quotes sq WHERE sq.deployment = sqlc.arg(deployment) GROUP BY sq.wallet
), returning_wallets AS (
    SELECT wallet FROM landed WHERE at < sqlc.arg(period_to)::timestamptz
    GROUP BY wallet HAVING count(DISTINCT (at AT TIME ZONE 'UTC')::date) >= 2
)
SELECT
    (SELECT COALESCE(sum(notional), 0) FROM landed WHERE at >= sqlc.arg(period_from)::timestamptz AND at < sqlc.arg(period_to)::timestamptz)::numeric AS volume_atoms,
    (SELECT COALESCE(sum(fee_credited_atoms), 0) FROM landed WHERE at >= sqlc.arg(period_from)::timestamptz AND at < sqlc.arg(period_to)::timestamptz)::numeric AS fee_atoms,
    (SELECT COALESCE(sum(floor(notional * tip_offset_bps / 10000)), 0) FROM landed WHERE at >= sqlc.arg(period_from)::timestamptz AND at < sqlc.arg(period_to)::timestamptz)::numeric AS tip_cost_atoms,
    (SELECT count(*) FROM landed WHERE at >= sqlc.arg(period_from)::timestamptz AND at < sqlc.arg(period_to)::timestamptz) AS landed_legs,
    (SELECT count(*) FROM seen WHERE at >= sqlc.arg(period_from)::timestamptz AND at < sqlc.arg(period_to)::timestamptz) AS seen_wallets,
    (SELECT count(*) FROM seen JOIN first_landed f USING (wallet)
     WHERE seen.at >= sqlc.arg(period_from)::timestamptz AND seen.at < sqlc.arg(period_to)::timestamptz AND f.at < sqlc.arg(period_to)::timestamptz) AS seen_and_activated_wallets,
    (SELECT count(*) FROM first_landed WHERE at >= sqlc.arg(period_from)::timestamptz AND at < sqlc.arg(period_to)::timestamptz) AS activated_wallets,
    (SELECT count(DISTINCT wallet) FROM landed WHERE at >= sqlc.arg(period_from)::timestamptz AND at < sqlc.arg(period_to)::timestamptz) AS active_wallets,
    (SELECT count(*) FROM returning_wallets) AS returning_wallets,
    (SELECT max(reconciled_at) FROM execution.legs)::timestamptz AS last_reconciled_at;

-- name: AdminFunnel :one
-- Per quote prepared by Seametry in the period. The browser's steps are
-- matched to those quotes by id; a step naming a quote never reported
-- here is not counted.
WITH period_quotes AS (
    SELECT pq.id, pq.outcome FROM execution.quotes pq
    WHERE pq.source = 'server' AND pq.deployment = sqlc.arg(deployment)
      AND pq.prepared_at >= sqlc.arg(period_from)::timestamptz AND pq.prepared_at < sqlc.arg(period_to)::timestamptz
), steps AS (
    SELECT f.kind, count(DISTINCT f.quote_id) AS quotes
    FROM execution.funnel_events f JOIN period_quotes p ON p.id = f.quote_id
    GROUP BY f.kind
)
SELECT
    (SELECT count(*) FROM period_quotes) AS requested,
    (SELECT count(*) FROM period_quotes WHERE outcome = 'prepared') AS prepared,
    (SELECT count(*) FROM period_quotes WHERE outcome = 'refused') AS refused,
    COALESCE((SELECT quotes FROM steps WHERE kind = 'review_opened'), 0)::bigint AS review_opened,
    COALESCE((SELECT quotes FROM steps WHERE kind = 'signature_requested'), 0)::bigint AS signature_requested,
    COALESCE((SELECT quotes FROM steps WHERE kind = 'signature_declined'), 0)::bigint AS signature_declined,
    COALESCE((SELECT quotes FROM steps WHERE kind = 'signature_failed'), 0)::bigint AS signature_failed,
    COALESCE((SELECT quotes FROM steps WHERE kind = 'sheet_abandoned'), 0)::bigint AS sheet_abandoned,
    (SELECT count(DISTINCT l.quote_id) FROM execution.legs l JOIN period_quotes p ON p.id = l.quote_id WHERE l.submit_result = 'sent') AS sent,
    (SELECT count(DISTINCT l.quote_id) FROM execution.legs l JOIN period_quotes p ON p.id = l.quote_id WHERE l.chain_outcome = 'landed') AS landed;

-- name: AdminRefusals :many
SELECT rq.refusal_status::integer AS status, count(*) AS quotes
FROM execution.quotes rq
WHERE rq.outcome = 'refused' AND rq.deployment = sqlc.arg(deployment)
  AND rq.prepared_at >= sqlc.arg(period_from)::timestamptz AND rq.prepared_at < sqlc.arg(period_to)::timestamptz
GROUP BY rq.refusal_status
ORDER BY quotes DESC, status;

-- name: AdminReliability :many
-- Legs sent in the period, by landing path. A leg found only on chain
-- recorded no landing path and is grouped as unrecorded.
SELECT COALESCE(l.landing, 'unrecorded')::text AS landing,
       count(*) AS sent,
       count(*) FILTER (WHERE l.chain_outcome = 'landed') AS landed,
       count(*) FILTER (WHERE l.chain_outcome = 'failed') AS failed,
       count(*) FILTER (WHERE l.chain_outcome = 'dropped') AS dropped,
       count(*) FILTER (WHERE l.chain_outcome IS NULL) AS unanswered
FROM execution.legs l
JOIN execution.quotes q ON q.id = l.quote_id
WHERE l.signature IS NOT NULL AND q.deployment = sqlc.arg(deployment)
  AND l.submitted_at >= sqlc.arg(period_from)::timestamptz AND l.submitted_at < sqlc.arg(period_to)::timestamptz
GROUP BY 1
ORDER BY sent DESC, landing;

-- name: AdminSources :many
-- Wallets by the first-touch ref code their first quote carried, unknown
-- when none was kept. A wallet counts under its source when it was seen or
-- activated in the period, or moved volume in it.
WITH landed AS (
    SELECT l.wallet, l.fee_credited_atoms,
           COALESCE(l.block_time, l.reconciled_at) AS at,
           GREATEST(0, CASE q.kind WHEN 'buy' THEN -l.wallet_usdc_delta ELSE l.wallet_usdc_delta END) AS notional
    FROM execution.legs l
    JOIN execution.quotes q ON q.id = l.quote_id
    WHERE l.chain_outcome = 'landed' AND q.deployment = sqlc.arg(deployment)
), first_landed AS (
    SELECT wallet, min(at) AS at FROM landed GROUP BY wallet
), in_period AS (
    SELECT wallet, sum(notional) AS volume, sum(fee_credited_atoms) AS fees FROM landed
    WHERE at >= sqlc.arg(period_from)::timestamptz AND at < sqlc.arg(period_to)::timestamptz
    GROUP BY wallet
), seen AS (
    SELECT sq.wallet, min(sq.prepared_at) AS at FROM execution.quotes sq WHERE sq.deployment = sqlc.arg(deployment) GROUP BY sq.wallet
), by_wallet AS (
    SELECT COALESCE(w.first_source ->> 'ref_code', 'unknown') AS source,
           s.at >= sqlc.arg(period_from)::timestamptz AND s.at < sqlc.arg(period_to)::timestamptz AS seen_in_period,
           COALESCE(f.at >= sqlc.arg(period_from)::timestamptz AND f.at < sqlc.arg(period_to)::timestamptz, false) AS activated_in_period,
           v.volume, v.fees
    FROM seen s
    JOIN execution.wallets w ON w.address = s.wallet
    LEFT JOIN first_landed f ON f.wallet = s.wallet
    LEFT JOIN in_period v ON v.wallet = s.wallet
)
SELECT source::text AS source,
       count(*) FILTER (WHERE seen_in_period) AS seen_wallets,
       count(*) FILTER (WHERE activated_in_period) AS activated_wallets,
       count(*) FILTER (WHERE volume IS NOT NULL) AS active_wallets,
       COALESCE(sum(volume), 0)::numeric AS volume_atoms,
       COALESCE(sum(fees), 0)::numeric AS fee_atoms
FROM by_wallet
WHERE seen_in_period OR activated_in_period OR volume IS NOT NULL
GROUP BY source
ORDER BY volume_atoms DESC, activated_wallets DESC, source;

-- name: AdminWallets :many
-- One page of the wallets seen in the deployment, newest first seen first,
-- all time, each with what its landed legs moved. A page starts after the
-- previous page's last (first_seen_at, wallet), so a wallet first seen while
-- paging shifts nothing already read. A wallet's address is public chain
-- data.
WITH landed AS (
    SELECT l.wallet, l.fee_credited_atoms,
           GREATEST(0, CASE q.kind WHEN 'buy' THEN -l.wallet_usdc_delta ELSE l.wallet_usdc_delta END) AS notional
    FROM execution.legs l
    JOIN execution.quotes q ON q.id = l.quote_id
    WHERE l.chain_outcome = 'landed' AND q.deployment = sqlc.arg(deployment)
), totals AS (
    SELECT wallet, count(*) AS landed_legs, sum(notional) AS volume, sum(fee_credited_atoms) AS fees FROM landed GROUP BY wallet
), seen AS (
    SELECT sq.wallet, min(sq.prepared_at) AS at, count(*) AS quotes FROM execution.quotes sq WHERE sq.deployment = sqlc.arg(deployment) GROUP BY sq.wallet
)
SELECT s.wallet::text AS address, s.at::timestamptz AS first_seen_at, s.quotes,
       COALESCE(w.first_source ->> 'ref_code', 'unknown')::text AS source,
       COALESCE(t.landed_legs, 0)::bigint AS landed_legs,
       COALESCE(t.volume, 0)::numeric AS volume_atoms,
       COALESCE(t.fees, 0)::numeric AS fee_atoms
FROM seen s
JOIN execution.wallets w ON w.address = s.wallet
LEFT JOIN totals t ON t.wallet = s.wallet
WHERE sqlc.narg(after_at)::timestamptz IS NULL
   OR s.at < sqlc.narg(after_at)::timestamptz
   OR (s.at = sqlc.narg(after_at)::timestamptz AND s.wallet > sqlc.narg(after_wallet)::text)
ORDER BY s.at DESC, s.wallet
LIMIT sqlc.arg(page_limit);

-- name: AdminWalletCount :one
-- Every wallet seen in the deployment, all time, the list's total.
SELECT count(DISTINCT wallet)::bigint FROM execution.quotes WHERE deployment = sqlc.arg(deployment);

-- name: AdminRecentActivity :many
-- The 50 most recent rows of the record before period_to, each with the
-- source that wrote it. Only a chain row says what settled.
SELECT at::timestamptz AS at, source::text AS source, event::text AS event, wallet::text AS wallet, detail::text AS detail
FROM (
    SELECT q.prepared_at AS at, 'server' AS source, 'quote_' || q.outcome AS event, q.wallet, q.kind AS detail
    FROM execution.quotes q
    WHERE q.source = 'server' AND q.deployment = sqlc.arg(deployment)
    UNION ALL
    SELECT l.submitted_at, 'server', 'leg_' || l.submit_result, l.wallet, COALESCE(l.symbol, l.mint)
    FROM execution.legs l JOIN execution.quotes q ON q.id = l.quote_id
    WHERE l.submitted_at IS NOT NULL AND l.source = 'server' AND q.deployment = sqlc.arg(deployment)
    UNION ALL
    SELECT COALESCE(l.block_time, l.reconciled_at), 'chain', l.chain_outcome, l.wallet, COALESCE(l.symbol, l.mint)
    FROM execution.legs l JOIN execution.quotes q ON q.id = l.quote_id
    WHERE l.chain_outcome IS NOT NULL AND q.deployment = sqlc.arg(deployment)
    UNION ALL
    SELECT f.received_at, 'client', f.kind, COALESCE(f.wallet, ''), COALESCE(f.raw_kind, '')
    FROM execution.funnel_events f
    WHERE f.deployment = sqlc.arg(deployment)
) recorded
WHERE at < sqlc.arg(period_to)::timestamptz
ORDER BY at DESC
LIMIT 50;
