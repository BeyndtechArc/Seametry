-- Wallets link through the Sign in with Solana plugin's single-use nonce
-- (Better Auth's verification table), so the old challenge table is unused.
DROP TABLE IF EXISTS seametry_wallet_challenge;
