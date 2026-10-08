import { authPool, getAuth } from "@/lib/auth";
import { canonicalAddress, walletChallenge } from "@/lib/wallet-link";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin) {
    return Response.json({ error: "Use this site's wallet link form." }, { status: 403 });
  }
  const auth = getAuth();
  const session = auth ? await auth.api.getSession({ headers: request.headers }) : undefined;
  if (!session) return Response.json({ error: "Sign in before linking a wallet." }, { status: 401 });
  let input: { address?: unknown };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Supply the wallet address to link." }, { status: 400 });
  }
  const address = canonicalAddress(input.address);
  if (!address) return Response.json({ error: "Supply a Solana wallet address to link." }, { status: 400 });
  const pool = authPool()!;
  await pool.query("DELETE FROM seametry_wallet_challenge WHERE expires_at <= now()");
  const active = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM seametry_wallet_challenge WHERE account_id = $1 AND expires_at > now()",
    [session.user.id],
  );
  if (Number(active.rows[0].count) >= 3) {
    return Response.json({ error: "Too many open wallet requests. Wait five minutes and retry." }, { status: 429 });
  }
  const challenge = walletChallenge(session.user.id, address, origin);
  await pool.query(
    "INSERT INTO seametry_wallet_challenge (id, account_id, address, message, expires_at) VALUES ($1, $2, $3, $4, $5)",
    [challenge.id, session.user.id, address, challenge.message, challenge.expiresAt],
  );
  return Response.json(challenge, { headers: { "Cache-Control": "no-store" } });
}
