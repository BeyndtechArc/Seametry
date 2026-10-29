import { canonicalAddress } from "./wallet-link.mjs";

const lastMethod = "This wallet is the only way to sign in to this account. Add another sign-in method before unlinking it.";

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
      return accountJson({ error: "Link a wallet by signing in with it while signed in." }, 405, { Allow: "GET, DELETE" });
    }

    if (request.method === "DELETE") {
      const input = await body(request);
      const address = canonicalAddress(input?.address);
      if (!address) return accountJson({ error: "Supply a Solana wallet address to unlink." }, 400);
      return unlink(account.user.id, address);
    }

    return accountJson({ error: "Method not allowed." }, 405, { Allow: "GET, DELETE" });
  }

  // An account keeps at least one way to sign in. The account's link rows are
  // locked first, so two unlinks of its last two wallets cannot both pass.
  async function unlink(accountId, address) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const linked = await client.query("SELECT address FROM seametry_wallet_link WHERE account_id = $1 FOR UPDATE", [accountId]);
      if (!linked.rows.some((row) => row.address === address)) {
        await client.query("ROLLBACK");
        return new Response(null, { status: 204 });
      }
      const others = await client.query(
        "SELECT count(*)::int AS count FROM account WHERE \"userId\" = $1 AND \"providerId\" <> 'solana'",
        [accountId],
      );
      if (linked.rows.length < 2 && Number(others.rows[0].count) === 0) {
        await client.query("ROLLBACK");
        return accountJson({ error: lastMethod, code: "LAST_SIGN_IN_METHOD" }, 409);
      }
      await client.query("DELETE FROM seametry_wallet_link WHERE account_id = $1 AND address = $2", [accountId, address]);
      await client.query(
        "DELETE FROM account WHERE \"userId\" = $1 AND \"providerId\" = 'solana' AND \"accountId\" = $2",
        [accountId, address],
      );
      await client.query("COMMIT");
      return new Response(null, { status: 204 });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return (path, request) => {
    if (path === "/api/account/wallets") return wallets(request);
    return accountJson({ error: "Not found." }, 404);
  };
}
