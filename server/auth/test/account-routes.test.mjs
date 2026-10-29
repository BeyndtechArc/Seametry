import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { createAccountRoutes } from "../src/account-routes.mjs";

const origin = "https://seametry.xyz";

// links: address -> account; methods: account -> other sign-in providers
// (google, credential). The client mirrors the pg client's transaction.
function harness({ links = new Map(), methods = new Map() } = {}) {
  const solanaAccounts = new Set(links.keys());
  const statements = [];
  async function query(sql, params = []) {
    statements.push(sql.split(" ")[0]);
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("SELECT address, verified_at FROM seametry_wallet_link WHERE account_id = $1 ORDER BY verified_at")) {
      return { rows: [...links].filter(([, account]) => account === params[0]).map(([address]) => ({ address, verified_at: new Date() })) };
    }
    if (sql.startsWith("SELECT address FROM seametry_wallet_link WHERE account_id = $1 FOR UPDATE")) {
      return { rows: [...links].filter(([, account]) => account === params[0]).map(([address]) => ({ address })) };
    }
    if (sql.startsWith('SELECT count(*)::int AS count FROM account WHERE "userId" = $1 AND "providerId" <> \'solana\'')) {
      return { rows: [{ count: (methods.get(params[0]) ?? []).length }] };
    }
    if (sql.startsWith("DELETE FROM seametry_wallet_link WHERE account_id = $1 AND address = $2")) {
      const owned = links.get(params[1]) === params[0];
      if (owned) links.delete(params[1]);
      return { rowCount: owned ? 1 : 0 };
    }
    if (sql.startsWith('DELETE FROM account WHERE "userId" = $1 AND "providerId" = \'solana\' AND "accountId" = $2')) {
      solanaAccounts.delete(params[1]);
      return { rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  const pool = { query, async connect() { return { query, release() {} }; } };
  const route = createAccountRoutes({
    pool,
    trustedOrigins: [origin],
    getSession: async (request) => {
      const account = request.headers.get("x-test-account");
      return account ? { user: { id: account } } : null;
    },
  });
  async function request(path, method = "GET", account = "account-1", payload, requestOrigin = origin) {
    const headers = { origin: requestOrigin };
    if (account) headers["x-test-account"] = account;
    if (payload) headers["content-type"] = "application/json";
    const response = await route(path, new Request(`${origin}${path}`, { method, headers, body: payload ? JSON.stringify(payload) : undefined }));
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }
  return { request, links, solanaAccounts, statements };
}

const address = () => Keypair.generate().publicKey.toBase58();

test("linked wallets are read only by their signed-in account", async () => {
  const mine = address();
  const { request } = harness({ links: new Map([[mine, "account-1"]]) });
  assert.equal((await request("/api/account/wallets", "GET", null)).status, 401);
  assert.equal((await request("/api/account/wallets", "GET", "account-1")).body.wallets[0].address, mine);
  assert.deepEqual((await request("/api/account/wallets", "GET", "account-2")).body.wallets, []);
});

test("the old challenge link routes are gone", async () => {
  const { request } = harness();
  assert.equal((await request("/api/account/wallets/challenge", "POST", "account-1", { address: address() })).status, 404);
  const linked = await request("/api/account/wallets", "POST", "account-1", { address: address() });
  assert.equal(linked.status, 405);
  assert.equal(linked.body.error, "Link a wallet by signing in with it while signed in.");
});

test("unlinking needs a trusted origin and a session", async () => {
  const wallet = address();
  const { request, links } = harness({ links: new Map([[wallet, "account-1"], [address(), "account-1"]]) });
  assert.equal((await request("/api/account/wallets", "DELETE", "account-1", { address: wallet }, "https://other.example")).status, 403);
  assert.equal((await request("/api/account/wallets", "DELETE", null, { address: wallet })).status, 401);
  assert.equal(links.get(wallet), "account-1");
});

test("a wallet-only account cannot unlink its last wallet", async () => {
  const wallet = address();
  const { request, links, statements } = harness({ links: new Map([[wallet, "account-1"]]) });
  const refused = await request("/api/account/wallets", "DELETE", "account-1", { address: wallet });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "LAST_SIGN_IN_METHOD");
  assert.equal(refused.body.error, "This wallet is the only way to sign in to this account. Add another sign-in method before unlinking it.");
  assert.equal(links.get(wallet), "account-1");
  assert.equal(statements.includes("ROLLBACK"), true);
});

test("one of two wallets can be unlinked, and its sign-in identity goes with it", async () => {
  const wallet = address();
  const other = address();
  const { request, links, solanaAccounts } = harness({ links: new Map([[wallet, "account-1"], [other, "account-1"]]) });
  assert.equal((await request("/api/account/wallets", "DELETE", "account-1", { address: wallet })).status, 204);
  assert.equal(links.has(wallet), false);
  assert.equal(solanaAccounts.has(wallet), false);
  assert.equal(links.get(other), "account-1");
  const last = await request("/api/account/wallets", "DELETE", "account-1", { address: other });
  assert.equal(last.status, 409);
});

test("an account that also signs in with Google can unlink its only wallet", async () => {
  const wallet = address();
  const { request, links } = harness({ links: new Map([[wallet, "account-1"]]), methods: new Map([["account-1", ["google"]]]) });
  assert.equal((await request("/api/account/wallets", "DELETE", "account-1", { address: wallet })).status, 204);
  assert.equal(links.has(wallet), false);
});

test("another account's wallet is not unlinked", async () => {
  const wallet = address();
  const { request, links } = harness({ links: new Map([[wallet, "account-1"], [address(), "account-2"]]) });
  assert.equal((await request("/api/account/wallets", "DELETE", "account-2", { address: wallet })).status, 204);
  assert.equal(links.get(wallet), "account-1");
});
