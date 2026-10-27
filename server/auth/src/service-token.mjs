// The Go Gateway reads the activity record only for wallets this claim
// names (GET /v1/me/activity), so it carries exactly the wallets this
// account proved it controls by signing a challenge. A wallet unlinked after
// a token is issued stays readable with that token until it expires.
//
// email and email_verified are the one profile field carried, because the
// Gateway admits /v1/admin/ only for a verified address in its allowlist
// (.plan/activity-record-and-admin.plan.md, Admin). The allowlist is decided
// there, not here: this service states what Google verified and nothing
// about who is an admin. emailVerified is sent only when it is literally
// true, so a missing or malformed value reads as unverified.
export const MAX_TOKEN_WALLETS = 20;

export function serviceTokenPayload(pool) {
  return async (session) => {
    const linked = await pool.query(
      "SELECT address FROM seametry_wallet_link WHERE account_id = $1 ORDER BY verified_at LIMIT $2",
      [session.user.id, MAX_TOKEN_WALLETS],
    );
    return {
      wallets: linked.rows.map((row) => row.address),
      email: typeof session.user.email === "string" ? session.user.email : "",
      email_verified: session.user.emailVerified === true,
    };
  };
}
