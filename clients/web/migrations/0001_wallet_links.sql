CREATE TABLE IF NOT EXISTS seametry_wallet_challenge (
  id uuid PRIMARY KEY,
  account_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  address text NOT NULL,
  message text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS seametry_wallet_challenge_account
  ON seametry_wallet_challenge (account_id, expires_at);

CREATE TABLE IF NOT EXISTS seametry_wallet_link (
  address text PRIMARY KEY,
  account_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seametry_wallet_link_account
  ON seametry_wallet_link (account_id);
