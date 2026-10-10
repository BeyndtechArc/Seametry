import { canonicalAddress, validWalletSignature, walletChallenge } from "./wallet-link.mjs";

const challengeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function accountJson(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function createAccountRoutes({ pool, trustedOrigins, getSession }) {
  function requestOrigin(request) {
    const origin = request.headers.get("origin");
    return origin && trustedOrigins.includes(origin) ? origin : undefined;
  }

  async function wallets(request) {
    const account = await getSession(request);
    if (!account) return accountJson({ error: "Sign in to read linked wallets." }, 401);

    if (request.method === "GET") {
      const records = await pool.query(
        "SELECT address, verified_at FROM seametry_wallet_link WHERE account_id = $1 ORDER BY verified_at",
        [account.user.id],
      );
      return accountJson({ wallets: records.rows });
    }

    if (!requestOrigin(request)) return accountJson({ error: "Use Seametry's wallet link form." }, 403);

    if (request.method === "POST") {
      const input = await body(request);
      const address = canonicalAddress(input?.address);
      if (!address || typeof input?.challengeId !== "string" || !challengeId.test(input.challengeId)) {
        return accountJson({ error: "Supply the address and challenge issued for this account." }, 400);
      }
      const consumed = await pool.query(
        "DELETE FROM seametry_wallet_challenge WHERE id = $1 AND account_id = $2 AND address = $3 RETURNING message, expires_at",
        [input.challengeId, account.user.id, address],
      );
      const challenge = consumed.rows[0];
      if (!challenge || challenge.expires_at.getTime() <= Date.now() ||
          !validWalletSignature(challenge.message, address, input.signature)) {
        return accountJson({ error: "The wallet signature or challenge is invalid. Request a new one." }, 400);
      }
      const inserted = await pool.query(
        "INSERT INTO seametry_wallet_link (address, account_id) VALUES ($1, $2) ON CONFLICT (address) DO NOTHING RETURNING address",
        [address, account.user.id],
      );
      return inserted.rowCount === 0
        ? accountJson({ error: "This wallet is already linked to an account." }, 409)
        : accountJson({ address }, 201);
    }

    if (request.method === "DELETE") {
      const input = await body(request);
      const address = canonicalAddress(input?.address);
      if (!address) return accountJson({ error: "Supply a Solana wallet address to unlink." }, 400);
      await pool.query("DELETE FROM seametry_wallet_link WHERE account_id = $1 AND address = $2", [account.user.id, address]);
      return new Response(null, { status: 204 });
    }

    return accountJson({ error: "Method not allowed." }, 405, { Allow: "GET, POST, DELETE" });
  }

  async function challenge(request) {
    if (request.method !== "POST") return accountJson({ error: "Method not allowed." }, 405, { Allow: "POST" });
    const origin = requestOrigin(request);
    if (!origin) return accountJson({ error: "Use Seametry's wallet link form." }, 403);
    const account = await getSession(request);
    if (!account) return accountJson({ error: "Sign in before linking a wallet." }, 401);
    const input = await body(request);
    const address = canonicalAddress(input?.address);
    if (!address) return accountJson({ error: "Supply the wallet address to link." }, 400);

    await pool.query("DELETE FROM seametry_wallet_challenge WHERE expires_at <= now()");
    const active = await pool.query(
      "SELECT count(*)::text AS count FROM seametry_wallet_challenge WHERE account_id = $1 AND expires_at > now()",
      [account.user.id],
    );
    if (Number(active.rows[0].count) >= 3) {
      return accountJson({ error: "Too many open wallet requests. Wait five minutes and retry." }, 429);
    }
    const issued = walletChallenge(account.user.id, address, origin);
    await pool.query(
      "INSERT INTO seametry_wallet_challenge (id, account_id, address, message, expires_at) VALUES ($1, $2, $3, $4, $5)",
      [issued.id, account.user.id, address, issued.message, issued.expiresAt],
    );
    return accountJson(issued);
  }

  return (path, request) => {
    if (path === "/api/account/wallets") return wallets(request);
    if (path === "/api/account/wallets/challenge") return challenge(request);
    return accountJson({ error: "Not found." }, 404);
  };
}
