-- The wallet an opt-in carries is the browser's word that it was connected:
-- the route takes it from the request body and no signature proves the
-- holder controls it (CR6). It is kept marked unverified, and the CHECK
-- refuses a row that claims a verification no flow can give. A later proof
-- flow lifts the CHECK in its own migration; until then nothing may mail,
-- link or attribute by this wallet as though it were the holder's.
--
-- Backward compatible: one column with a default and a comment, so code from
-- before this migration inserts as it did and every row reads unverified.

-- +goose Up
ALTER TABLE alert.email_optins
    ADD COLUMN wallet_verified boolean NOT NULL DEFAULT false CHECK (NOT wallet_verified);
COMMENT ON COLUMN alert.email_optins.wallet IS 'Unverified: the wallet the browser said was connected, kept as given. No signature proves the holder controls it; see wallet_verified.';

-- +goose Down
COMMENT ON COLUMN alert.email_optins.wallet IS NULL;
ALTER TABLE alert.email_optins DROP COLUMN wallet_verified;
