import { WALLET_EMAIL_DOMAIN } from "./solana-sign-in.mjs";
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
//
// A wallet-only account's placeholder email (solana-sign-in.mjs) is never
// carried, and never reads as verified, whatever the stored flag says.
//
// auth_methods names the account's sign-in providers (solana, google, and
// email for Better Auth's credential provider); kyc_level is "none" until a
// verification provider exists.
export const MAX_TOKEN_WALLETS = 20;

const methodNames = { solana: "solana", google: "google", credential: "email" };
const methodOrder = ["solana", "google", "email"];

export function serviceTokenPayload(pool) {
  return async (session) => {
    const linked = await pool.query(
      "SELECT address FROM seametry_wallet_link WHERE account_id = $1 ORDER BY verified_at LIMIT $2",
      [session.user.id, MAX_TOKEN_WALLETS],
    );
    const providers = await pool.query('SELECT DISTINCT "providerId" AS provider FROM account WHERE "userId" = $1', [session.user.id]);
    const methods = new Set(providers.rows.map((row) => methodNames[row.provider]).filter(Boolean));
    const email = typeof session.user.email === "string" ? session.user.email : "";
    const placeholder = email.toLowerCase().endsWith(`@${WALLET_EMAIL_DOMAIN}`);
    return {
      wallets: linked.rows.map((row) => row.address),
      email: placeholder ? "" : email,
      email_verified: !placeholder && session.user.emailVerified === true,
      auth_methods: methodOrder.filter((method) => methods.has(method)),
      kyc_level: "none",
    };
  };
}
