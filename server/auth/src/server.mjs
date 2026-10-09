import { createServer } from "node:http";
import { auth, pool, trustedOrigins } from "./auth.mjs";
import { canonicalAddress, validWalletSignature, walletChallenge } from "./wallet-link.mjs";

const port = Number(process.env.PORT ?? 3005);
const challengeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function json(value, status = 200, headers = {}) {
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

function requestOrigin(request) {
  const origin = request.headers.get("origin");
  return origin && trustedOrigins.includes(origin) ? origin : undefined;
}

async function session(request) {
  return auth.api.getSession({ headers: request.headers });
}

async function wallets(request) {
  const account = await session(request);
  if (!account) return json({ error: "Sign in to read linked wallets." }, 401);

  if (request.method === "GET") {
    const records = await pool.query(
      "SELECT address, verified_at FROM seametry_wallet_link WHERE account_id = $1 ORDER BY verified_at",
      [account.user.id],
    );
    return json({ wallets: records.rows });
  }

  if (!requestOrigin(request)) return json({ error: "Use Seametry's wallet link form." }, 403);

  if (request.method === "POST") {
    const input = await body(request);
    const address = canonicalAddress(input?.address);
    if (!address || typeof input?.challengeId !== "string" || !challengeId.test(input.challengeId)) {
      return json({ error: "Supply the address and challenge issued for this account." }, 400);
    }
    const consumed = await pool.query(
      "DELETE FROM seametry_wallet_challenge WHERE id = $1 AND account_id = $2 AND address = $3 RETURNING message, expires_at",
      [input.challengeId, account.user.id, address],
    );
    const challenge = consumed.rows[0];
    if (!challenge || challenge.expires_at.getTime() <= Date.now() ||
        !validWalletSignature(challenge.message, address, input.signature)) {
      return json({ error: "The wallet signature or challenge is invalid. Request a new one." }, 400);
    }
    const inserted = await pool.query(
      "INSERT INTO seametry_wallet_link (address, account_id) VALUES ($1, $2) ON CONFLICT (address) DO NOTHING RETURNING address",
      [address, account.user.id],
    );
    return inserted.rowCount === 0
      ? json({ error: "This wallet is already linked to an account." }, 409)
      : json({ address }, 201);
  }

  if (request.method === "DELETE") {
    const input = await body(request);
    const address = canonicalAddress(input?.address);
    if (!address) return json({ error: "Supply a Solana wallet address to unlink." }, 400);
    await pool.query("DELETE FROM seametry_wallet_link WHERE account_id = $1 AND address = $2", [account.user.id, address]);
    return new Response(null, { status: 204 });
  }

  return json({ error: "Method not allowed." }, 405, { Allow: "GET, POST, DELETE" });
}

async function challenge(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
  const origin = requestOrigin(request);
  if (!origin) return json({ error: "Use Seametry's wallet link form." }, 403);
  const account = await session(request);
  if (!account) return json({ error: "Sign in before linking a wallet." }, 401);
  const input = await body(request);
  const address = canonicalAddress(input?.address);
  if (!address) return json({ error: "Supply the wallet address to link." }, 400);

  await pool.query("DELETE FROM seametry_wallet_challenge WHERE expires_at <= now()");
  const active = await pool.query(
    "SELECT count(*)::text AS count FROM seametry_wallet_challenge WHERE account_id = $1 AND expires_at > now()",
    [account.user.id],
  );
  if (Number(active.rows[0].count) >= 3) {
    return json({ error: "Too many open wallet requests. Wait five minutes and retry." }, 429);
  }
  const issued = walletChallenge(account.user.id, address, origin);
  await pool.query(
    "INSERT INTO seametry_wallet_challenge (id, account_id, address, message, expires_at) VALUES ($1, $2, $3, $4, $5)",
    [issued.id, account.user.id, address, issued.message, issued.expiresAt],
  );
  return json(issued);
}

async function readBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_048_576) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function toWebRequest(request) {
  const url = new URL(request.url ?? "/", process.env.BETTER_AUTH_URL);
  const body = await readBody(request);
  return new Request(url, { method: request.method, headers: request.headers, body });
}

async function write(response, target) {
  target.statusCode = response.status;
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") target.setHeader(name, value);
  }
  if (typeof response.headers.getSetCookie === "function") {
    const cookies = response.headers.getSetCookie();
    if (cookies.length) target.setHeader("set-cookie", cookies);
  } else if (response.headers.get("set-cookie")) {
    target.setHeader("set-cookie", response.headers.get("set-cookie"));
  }
  target.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = await toWebRequest(incoming);
    const path = new URL(request.url).pathname;
    let response;
    if (path.startsWith("/api/auth/")) response = await auth.handler(request);
    else if (path === "/api/account/wallets") response = await wallets(request);
    else if (path === "/api/account/wallets/challenge") response = await challenge(request);
    else if (path === "/healthz") response = json({ status: "ok" });
    else response = json({ error: "Not found." }, 404);
    await write(response, outgoing);
  } catch (error) {
    console.error(error);
    await write(json({ error: "Account service failed." }, 500), outgoing);
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Seametry auth listening on ${port}`));

async function shutdown() {
  server.close();
  await pool.end();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
