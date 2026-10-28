-- A wallet's source is the one its first quote carried, and nothing later
-- replaces it (CR3). Before this, a wallet first quoted with no first touch
-- kept first_source NULL, and a later quote carrying a referrer filled it,
-- crediting a campaign the wallet did not come from.
--
-- first_source_at now records when the first quote decided the source,
-- whether or not it carried one: first_source NULL with first_source_at set
-- is an explicit unknown. Both NULL means no quote has decided yet, as for a
-- wallet seen only in an imported chain trade.
--
-- Backward compatible: the change only loosens a CHECK, so every existing
-- row stays valid and code from before this migration keeps working against
-- it. Existing rows with no source stay undecided, because nothing recorded
-- says whether their first quote carried none, and their next quote decides.

-- +goose Up
ALTER TABLE execution.wallets
    DROP CONSTRAINT wallets_check,
    ADD CONSTRAINT wallets_source_decided CHECK (first_source IS NULL OR first_source_at IS NOT NULL);

-- +goose Down
-- Rows that are an explicit unknown go back to undecided, the only shape the
-- old CHECK allows.
UPDATE execution.wallets SET first_source_at = NULL WHERE first_source IS NULL;
ALTER TABLE execution.wallets
    DROP CONSTRAINT wallets_source_decided,
    ADD CONSTRAINT wallets_check CHECK ((first_source IS NULL) = (first_source_at IS NULL));
