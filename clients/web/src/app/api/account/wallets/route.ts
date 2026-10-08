import { authPool, getAuth } from "@/lib/auth";
import { canonicalAddress, validWalletSignature } from "@/lib/wallet-link";

export const runtime = "nodejs";

async function account(request: Request) {
  const auth = getAuth();
  if (!auth) return undefined;
  return auth.api.getSession({ headers: request.headers });
}

function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function GET(request: Request) {
  const session = await account(request);
  if (!session) return Response.json({ error: "Sign in to read linked wallets." }, { status: 401 });
  const records = await authPool()!.query(
    "SELECT address, verified_at FROM seametry_wallet_link WHERE account_id = $1 ORDER BY verified_at",
    [session.user.id],
  );
  return Response.json({ wallets: records.rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Use this site's wallet link form." }, { status: 403 });
  const session = await account(request);
  if (!session) return Response.json({ error: "Sign in before linking a wallet." }, { status: 401 });
  let input: { address?: unknown; challengeId?: unknown; signature?: unknown };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Supply a signed wallet challenge." }, { status: 400 });
  }
  const address = canonicalAddress(input.address);
  if (!address || typeof input.challengeId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.challengeId)) {
    return Response.json({ error: "Supply the address and challenge issued for this account." }, { status: 400 });
  }
  const pool = authPool()!;
  const consumed = await pool.query<{ message: string; expires_at: Date }>(
    "DELETE FROM seametry_wallet_challenge WHERE id = $1 AND account_id = $2 AND address = $3 RETURNING message, expires_at",
    [input.challengeId, session.user.id, address],
  );
  const challenge = consumed.rows[0];
  if (!challenge || challenge.expires_at.getTime() <= Date.now() ||
      !validWalletSignature(challenge.message, address, input.signature)) {
    return Response.json({ error: "The wallet signature or challenge is invalid. Request a new one." }, { status: 400 });
  }
  const inserted = await pool.query(
    "INSERT INTO seametry_wallet_link (address, account_id) VALUES ($1, $2) ON CONFLICT (address) DO NOTHING RETURNING address",
    [address, session.user.id],
  );
  if (inserted.rowCount === 0) {
    return Response.json({ error: "This wallet is already linked to an account." }, { status: 409 });
  }
  return Response.json({ address }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Use this site's wallet link form." }, { status: 403 });
  const session = await account(request);
  if (!session) return Response.json({ error: "Sign in before unlinking a wallet." }, { status: 401 });
  let input: { address?: unknown };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Supply the wallet address to unlink." }, { status: 400 });
  }
  const address = canonicalAddress(input.address);
  if (!address) return Response.json({ error: "Supply a Solana wallet address to unlink." }, { status: 400 });
  await authPool()!.query("DELETE FROM seametry_wallet_link WHERE account_id = $1 AND address = $2", [session.user.id, address]);
  return new Response(null, { status: 204 });
}
