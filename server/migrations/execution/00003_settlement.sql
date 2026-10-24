-- What settled (.plan/activity-record-and-admin.plan.md, PR 2). The
-- reconciler writes the chain's answer onto each sent leg: landed, failed or
-- dropped, with what actually moved for the wallet and into the fee account.
-- The backfill writes legs found only on chain, from the fee account's
-- public history, which carry no quoted terms because no quote of them was
-- recorded; those columns stay required for 'server' rows.

-- +goose Up

ALTER TABLE execution.legs
    ALTER COLUMN symbol DROP NOT NULL,
    ALTER COLUMN in_atoms DROP NOT NULL,
    ALTER COLUMN in_scale DROP NOT NULL,
    ALTER COLUMN out_atoms DROP NOT NULL,
    ALTER COLUMN floor_atoms DROP NOT NULL,
    ALTER COLUMN out_scale DROP NOT NULL,
    ALTER COLUMN routing_fee_bps DROP NOT NULL,
    ALTER COLUMN tip_offset_bps DROP NOT NULL,
    ALTER COLUMN simulated_fee_atoms DROP NOT NULL,
    ALTER COLUMN tip_lamports DROP NOT NULL,
    ALTER COLUMN landing DROP NOT NULL,
    ALTER COLUMN last_valid_block_height DROP NOT NULL,
    ADD CONSTRAINT legs_server_terms CHECK (source <> 'server' OR (
        symbol IS NOT NULL AND in_atoms IS NOT NULL AND in_scale IS NOT NULL AND out_atoms IS NOT NULL
        AND floor_atoms IS NOT NULL AND out_scale IS NOT NULL AND routing_fee_bps IS NOT NULL
        AND tip_offset_bps IS NOT NULL AND simulated_fee_atoms IS NOT NULL AND tip_lamports IS NOT NULL
        AND landing IS NOT NULL AND last_valid_block_height IS NOT NULL)),
    ADD COLUMN chain_outcome        text CHECK (chain_outcome IN ('landed', 'failed', 'dropped')),
    ADD COLUMN slot                 bigint CHECK (slot > 0),
    ADD COLUMN block_time           timestamptz,
    -- The cluster's own error value, kept as it came, never interpreted here.
    ADD COLUMN chain_error          jsonb,
    ADD COLUMN network_fee_lamports numeric(20, 0) CHECK (network_fee_lamports >= 0),
    -- Signed: what the wallet's USDC and token balances changed by, and the
    -- token's scale, read from the transaction's own balances.
    ADD COLUMN wallet_usdc_delta    numeric(21, 0),
    ADD COLUMN wallet_token_delta   numeric(21, 0),
    ADD COLUMN token_scale          smallint CHECK (token_scale BETWEEN 0 AND 18),
    ADD COLUMN fee_credited_atoms   numeric(21, 0),
    ADD COLUMN reconciled_at        timestamptz,
    ADD CONSTRAINT legs_settled_together CHECK ((chain_outcome IS NULL) = (reconciled_at IS NULL)),
    ADD CONSTRAINT legs_chain_rows_settled CHECK (source <> 'chain' OR chain_outcome IS NOT NULL);

CREATE INDEX legs_unsettled ON execution.legs (submitted_at)
    WHERE signature IS NOT NULL AND chain_outcome IS NULL;

-- +goose Down
DROP INDEX execution.legs_unsettled;
ALTER TABLE execution.legs
    DROP CONSTRAINT legs_chain_rows_settled,
    DROP CONSTRAINT legs_settled_together,
    DROP COLUMN reconciled_at,
    DROP COLUMN fee_credited_atoms,
    DROP COLUMN token_scale,
    DROP COLUMN wallet_token_delta,
    DROP COLUMN wallet_usdc_delta,
    DROP COLUMN network_fee_lamports,
    DROP COLUMN chain_error,
    DROP COLUMN block_time,
    DROP COLUMN slot,
    DROP COLUMN chain_outcome,
    DROP CONSTRAINT legs_server_terms;
