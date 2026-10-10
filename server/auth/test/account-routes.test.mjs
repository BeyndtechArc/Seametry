import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { createAccountRoutes } from "../src/account-routes.mjs";

const origin = "https://seametry.xyz";

function harness() {
  const challenges = new Map();
  const links = new Map();
  const pool = {
    async query(sql, params = []) {
      if (sql.startsWith("SELECT address, verified_at")) {
        return { rows: [...links].filter(([, account]) => account === params[0]).map(([address]) => ({ address, verified_at: new Date() })) };
      }
      if (sql.startsWith("DELETE FROM seametry_wallet_challenge WHERE expires_at")) return { rowCount: 0 };
      if (sql.startsWith("SELECT count(*)")) {
        return { rows: [{ count: String([...challenges.values()].filter((item) => item.account === params[0]).length) }] };
      }
      if (sql.startsWith("INSERT INTO seametry_wallet_challenge")) {
        challenges.set(params[0], { account: params[1], address: params[2], message: params[3], expires_at: new Date(params[4]) });
        return { rowCount: 1 };
      }
      if (sql.startsWith("DELETE FROM seametry_wallet_challenge WHERE id")) {
        const item = challenges.get(params[0]);
        if (!item || item.account !== params[1] || item.address !== params[2]) return { rows: [] };
        challenges.delete(params[0]);
        return { rows: [{ message: item.message, expires_at: item.expires_at }] };
      }
      if (sql.startsWith("INSERT INTO seametry_wallet_link")) {
        if (links.has(params[0])) return { rowCount: 0 };
        links.set(params[0], params[1]);
        return { rowCount: 1 };
      }
      if (sql.startsWith("DELETE FROM seametry_wallet_link")) {
        if (links.get(params[1]) === params[0]) links.delete(params[1]);
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
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
    const response = await route(path, new Request(`${origin}${path}`, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    }));
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }
  return { request, links };
}

test("a signed challenge links only the signing account and can be unlinked", async () => {
  const { request } = harness();
  const wallet = Keypair.generate();
  const address = wallet.publicKey.toBase58();
  assert.equal((await request("/api/account/wallets", "GET", null)).status, 401);
  assert.equal((await request("/api/account/wallets/challenge", "POST", "account-1", { address }, "https://other.example")).status, 403);

  const issued = await request("/api/account/wallets/challenge", "POST", "account-1", { address });
  assert.equal(issued.status, 200);
  const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(issued.body.message), wallet.secretKey)).toString("base64");
  const proof = { address, challengeId: issued.body.id, signature };
  assert.equal((await request("/api/account/wallets", "POST", "account-2", proof)).status, 400);
  assert.equal((await request("/api/account/wallets", "POST", "account-1", proof)).status, 201);
  assert.equal((await request("/api/account/wallets", "POST", "account-1", proof)).status, 400);
  assert.deepEqual((await request("/api/account/wallets", "GET", "account-2")).body.wallets, []);
  assert.equal((await request("/api/account/wallets", "GET", "account-1")).body.wallets[0].address, address);
  assert.equal((await request("/api/account/wallets", "DELETE", "account-2", { address })).status, 204);
  assert.equal((await request("/api/account/wallets", "GET", "account-1")).body.wallets.length, 1);
  assert.equal((await request("/api/account/wallets", "DELETE", "account-1", { address })).status, 204);
  assert.deepEqual((await request("/api/account/wallets", "GET", "account-1")).body.wallets, []);
});

test("a signature from a different wallet cannot link the requested address", async () => {
  const { request } = harness();
  const wallet = Keypair.generate();
  const issued = await request("/api/account/wallets/challenge", "POST", "account-1", { address: wallet.publicKey.toBase58() });
  const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(issued.body.message), Keypair.generate().secretKey)).toString("base64");
  assert.equal((await request("/api/account/wallets", "POST", "account-1", {
    address: wallet.publicKey.toBase58(), challengeId: issued.body.id, signature,
  })).status, 400);
  assert.deepEqual((await request("/api/account/wallets", "GET", "account-1")).body.wallets, []);
});

test("a wallet already linked to another account cannot be taken over", async () => {
  const { request } = harness();
  const wallet = Keypair.generate();
  const address = wallet.publicKey.toBase58();
  for (const account of ["account-1", "account-2"]) {
    const issued = await request("/api/account/wallets/challenge", "POST", account, { address });
    const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(issued.body.message), wallet.secretKey)).toString("base64");
    const linked = await request("/api/account/wallets", "POST", account, { address, challengeId: issued.body.id, signature });
    assert.equal(linked.status, account === "account-1" ? 201 : 409);
  }
  assert.deepEqual((await request("/api/account/wallets", "GET", "account-2")).body.wallets, []);
});
