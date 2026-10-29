import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createSignInMessageText } from "@solana/wallet-standard-util";
import { poolWallets, solanaSignIn, WALLET_EMAIL_DOMAIN } from "../src/solana-sign-in.mjs";
import { serviceTokenPayload } from "../src/service-token.mjs";

const origin = "https://seametry.xyz";

function harness({ now, rateLimited = false } = {}) {
  const links = new Map();
  const db = { user: [], session: [], account: [], verification: [], rateLimit: [] };
  const wallets = {
    async ownerOf(address) {
      return links.get(address);
    },
    async claim(address, userId) {
      if (links.has(address)) return false;
      links.set(address, userId);
      return true;
    },
  };
  const auth = betterAuth({
    baseURL: origin,
    basePath: "/api/auth",
    secret: "test-secret-test-secret-test-secret-0123",
    trustedOrigins: [origin],
    database: memoryAdapter(db),
    rateLimit: { enabled: rateLimited, storage: "memory" },
    advanced: { ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } },
    plugins: [solanaSignIn({ trustedOrigins: [origin], wallets, ...(now ? { now } : {}) })],
  });
  let ip = 0;
  async function post(path, body, { cookie, from = origin } = {}) {
    ip += 1;
    const headers = { "content-type": "application/json", origin: from, "x-forwarded-for": `10.0.0.${ip}` };
    if (cookie) headers.cookie = cookie;
    const response = await auth.handler(new Request(`${origin}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body ?? {}) }));
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined, cookie: response.headers.get("set-cookie") ?? "" };
  }
  return { auth, db, links, post };
}

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

function sign(keypair, input, overrides = {}) {
  const address = keypair.publicKey.toBase58();
  const text = createSignInMessageText({ ...input, address, ...overrides });
  const signedMessage = new TextEncoder().encode(text);
  return { address, publicKey: b64(keypair.publicKey.toBytes()), signedMessage: b64(signedMessage), signature: b64(nacl.sign.detached(signedMessage, keypair.secretKey)) };
}

async function signIn(h, keypair, { overrides, tamper, signer, cookie } = {}) {
  const nonce = await h.post("/solana/nonce", { address: keypair.publicKey.toBase58() });
  assert.equal(nonce.status, 200);
  const output = sign(keypair, nonce.body.input, overrides);
  if (signer) output.signature = sign(signer, nonce.body.input).signature;
  if (tamper) output.signedMessage = b64(new TextEncoder().encode(tamper(Buffer.from(output.signedMessage, "base64").toString())));
  return { nonce: nonce.body.input.nonce, output, result: await h.post("/solana/verify", { nonce: nonce.body.input.nonce, output }, { cookie }) };
}

function sessionCookie(setCookie) {
  return setCookie.split(/,(?=\s*[^;,]+=)/).map((part) => part.split(";")[0].trim()).filter((part) => part.includes("session_token")).join("; ");
}

test("the nonce is bound to our domain and origin, and expires in five minutes", async () => {
  const h = harness();
  const response = await h.post("/solana/nonce", {});
  assert.equal(response.status, 200);
  const { input } = response.body;
  assert.equal(input.domain, "seametry.xyz");
  assert.equal(input.uri, origin);
  assert.equal(input.chainId, "solana:mainnet");
  assert.match(input.nonce, /^[A-Za-z0-9]{8,}$/);
  assert.equal(new Date(input.expirationTime) - new Date(input.issuedAt), 5 * 60 * 1000);
});

test("a nonce is not issued to an untrusted origin", async () => {
  const h = harness();
  const response = await h.post("/solana/nonce", {}, { from: "https://evil.example" });
  assert.equal(response.status, 403);
});

test("a valid signature signs in a new wallet-only account with a session cookie", async () => {
  const h = harness();
  const keypair = Keypair.generate();
  const { result } = await signIn(h, keypair);
  assert.equal(result.status, 200);
  assert.match(result.cookie, /session_token=/);
  const address = keypair.publicKey.toBase58();
  assert.equal(result.body.user.walletAddress, address);
  assert.equal(h.links.get(address), result.body.user.id);
  const session = await h.auth.api.getSession({ headers: new Headers({ cookie: sessionCookie(result.cookie) }) });
  assert.equal(session.user.id, result.body.user.id);
  assert.ok(h.db.account.some((row) => row.providerId === "solana" && row.accountId === address && row.userId === result.body.user.id));
});

test("a second sign-in with the same wallet reaches the same account", async () => {
  const h = harness();
  const keypair = Keypair.generate();
  const first = await signIn(h, keypair);
  const second = await signIn(h, keypair);
  assert.equal(second.result.status, 200);
  assert.equal(second.result.body.user.id, first.result.body.user.id);
  assert.equal(h.db.user.length, 1);
  assert.equal(h.db.account.length, 1);
});

test("a wallet already linked to an account signs in as that account", async () => {
  const h = harness();
  const keypair = Keypair.generate();
  const owner = await h.auth.$context.then((ctx) => ctx.internalAdapter.createUser({ name: "Owner", email: "owner@example.com", emailVerified: true }));
  h.links.set(keypair.publicKey.toBase58(), owner.id);
  const { result } = await signIn(h, keypair);
  assert.equal(result.status, 200);
  assert.equal(result.body.user.id, owner.id);
  assert.equal(h.db.user.length, 1);
});

test("a replayed nonce is refused", async () => {
  const h = harness();
  const keypair = Keypair.generate();
  const first = await signIn(h, keypair);
  assert.equal(first.result.status, 200);
  const replay = await h.post("/solana/verify", { nonce: first.nonce, output: first.output });
  assert.equal(replay.status, 401);
  assert.equal(replay.cookie.includes("session_token="), false);
});

test("an expired nonce is refused", async () => {
  let clock = new Date();
  const h = harness({ now: () => clock });
  const keypair = Keypair.generate();
  const nonce = await h.post("/solana/nonce", {});
  const output = sign(keypair, nonce.body.input);
  clock = new Date(clock.getTime() + 5 * 60 * 1000 + 1);
  const result = await h.post("/solana/verify", { nonce: nonce.body.input.nonce, output });
  assert.equal(result.status, 401);
  assert.equal(h.db.user.length, 0);
});

test("a message signed for another domain is refused", async () => {
  const h = harness();
  const { result } = await signIn(h, Keypair.generate(), { overrides: { domain: "evil.example", uri: "https://evil.example" } });
  assert.equal(result.status, 401);
  assert.equal(h.db.user.length, 0);
});

test("verifying from an untrusted origin is refused", async () => {
  const h = harness();
  const keypair = Keypair.generate();
  const nonce = await h.post("/solana/nonce", {});
  const output = sign(keypair, nonce.body.input);
  const result = await h.post("/solana/verify", { nonce: nonce.body.input.nonce, output }, { from: "https://evil.example" });
  assert.equal(result.status, 403);
  assert.equal(h.db.user.length, 0);
});

test("a signature from another key is refused", async () => {
  const h = harness();
  const { result } = await signIn(h, Keypair.generate(), { signer: Keypair.generate() });
  assert.equal(result.status, 401);
  assert.equal(h.db.user.length, 0);
});

test("a message changed after signing is refused", async () => {
  const h = harness();
  const { result } = await signIn(h, Keypair.generate(), { tamper: (text) => text.replace("This does not approve a transaction.", "Approve everything.") });
  assert.equal(result.status, 401);
  assert.equal(h.db.user.length, 0);
});

test("an address that is not the signing key is refused", async () => {
  const h = harness();
  const keypair = Keypair.generate();
  const other = Keypair.generate().publicKey.toBase58();
  const nonce = await h.post("/solana/nonce", {});
  const output = sign(keypair, nonce.body.input);
  output.address = other;
  const result = await h.post("/solana/verify", { nonce: nonce.body.input.nonce, output });
  assert.equal(result.status, 401);
  assert.equal(h.db.user.length, 0);
});

test("signing in with a wallet owned by another account while signed in is refused", async () => {
  const h = harness();
  const mine = Keypair.generate();
  const theirs = Keypair.generate();
  const me = await signIn(h, mine);
  const them = await signIn(h, theirs);
  const cookie = sessionCookie(me.result.cookie);
  const { result } = await signIn(h, theirs, { cookie });
  assert.equal(result.status, 409);
  assert.equal(h.links.get(theirs.publicKey.toBase58()), them.result.body.user.id);
  const session = await h.auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.equal(session.user.id, me.result.body.user.id);
});

test("signing in with an unowned wallet while signed in is refused, not linked", async () => {
  const h = harness();
  const me = await signIn(h, Keypair.generate());
  const fresh = Keypair.generate();
  const { result } = await signIn(h, fresh, { cookie: sessionCookie(me.result.cookie) });
  assert.equal(result.status, 409);
  assert.equal(h.links.has(fresh.publicKey.toBase58()), false);
});

test("a wallet-only account is never email-verified and its token carries no email", async () => {
  const h = harness();
  const keypair = Keypair.generate();
  const { result } = await signIn(h, keypair);
  const user = h.db.user.find((row) => row.id === result.body.user.id);
  assert.equal(user.emailVerified, false);
  assert.ok(user.email.endsWith(`@${WALLET_EMAIL_DOMAIN}`));
  const pool = { async query() { return { rows: [{ address: keypair.publicKey.toBase58() }] }; } };
  const payload = await serviceTokenPayload(pool)({ user });
  assert.deepEqual(payload, { wallets: [keypair.publicKey.toBase58()], email: "", email_verified: false });
  const forged = await serviceTokenPayload(pool)({ user: { ...user, emailVerified: true } });
  assert.equal(forged.email, "");
  assert.equal(forged.email_verified, false);
});

test("nonce and verify requests are rate limited", async () => {
  const h = harness({ rateLimited: true });
  const auth = h.auth;
  for (const path of ["/solana/nonce", "/solana/verify"]) {
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await auth.handler(new Request(`${origin}/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": "10.9.9.9" }, body: "{}" }));
      statuses.push(response.status);
    }
    assert.equal(statuses.slice(0, 10).includes(429), false, path);
    assert.equal(statuses.at(-1), 429, path);
  }
});

test("wallet ownership reads and claims seametry_wallet_link, first claim wins", async () => {
  const links = new Map();
  const pool = {
    async query(sql, params) {
      if (sql.startsWith("SELECT account_id FROM seametry_wallet_link WHERE address = $1")) {
        return { rows: links.has(params[0]) ? [{ account_id: links.get(params[0]) }] : [] };
      }
      if (sql.startsWith("INSERT INTO seametry_wallet_link (address, account_id) VALUES ($1, $2) ON CONFLICT (address) DO NOTHING")) {
        if (links.has(params[0])) return { rows: [] };
        links.set(params[0], params[1]);
        return { rows: [{ address: params[0] }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const wallets = poolWallets(pool);
  assert.equal(await wallets.ownerOf("w"), undefined);
  assert.equal(await wallets.claim("w", "a"), true);
  assert.equal(await wallets.claim("w", "b"), false);
  assert.equal(await wallets.ownerOf("w"), "a");
});
