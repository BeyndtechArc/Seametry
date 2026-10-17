-- name: UnsettledLegs :many
-- Sent legs the chain has not yet answered for, oldest first. A leg refused
-- before broadcast reached nothing, so there is nothing to ask about it.
SELECT l.id, l.wallet, l.mint, l.symbol, l.signature, l.last_valid_block_height
FROM execution.legs l
WHERE l.signature IS NOT NULL AND l.chain_outcome IS NULL AND l.submit_result <> 'refused_not_sent'
ORDER BY l.submitted_at
LIMIT 256;

-- name: SettleLeg :execrows
-- Only an unsettled leg is settled: the chain's first answer stands.
UPDATE execution.legs SET
    chain_outcome = sqlc.arg(chain_outcome), slot = sqlc.narg(slot), block_time = sqlc.narg(block_time),
    chain_error = sqlc.narg(chain_error), network_fee_lamports = sqlc.narg(network_fee_lamports),
    wallet_usdc_delta = sqlc.narg(wallet_usdc_delta), wallet_token_delta = sqlc.narg(wallet_token_delta),
    token_scale = sqlc.narg(token_scale), fee_credited_atoms = sqlc.narg(fee_credited_atoms),
    reconciled_at = sqlc.arg(reconciled_at)
WHERE id = sqlc.arg(id) AND chain_outcome IS NULL;

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
-- was lost carries the same message, and the server's row is kept.
ON CONFLICT DO NOTHING;

-- name: DeleteFunnelEventsBefore :execrows
-- The privacy policy keeps funnel steps 24 months.
DELETE FROM execution.funnel_events WHERE received_at < $1;
