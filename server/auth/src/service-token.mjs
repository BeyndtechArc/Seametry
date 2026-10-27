// The Go Gateway reads the activity record only for wallets this claim
// names (GET /v1/me/activity), so it carries exactly the wallets this
// account proved it controls by signing a challenge, and no profile field.
// A wallet unlinked after a token is issued stays readable with that token
// until it expires.
export const MAX_TOKEN_WALLETS = 20;

export function serviceTokenPayload(pool) {
  return async (session) => {
    const linked = await pool.query(
      "SELECT address FROM seametry_wallet_link WHERE account_id = $1 ORDER BY verified_at LIMIT $2",
      [session.user.id, MAX_TOKEN_WALLETS],
    );
    return { wallets: linked.rows.map((row) => row.address) };
  };
}
