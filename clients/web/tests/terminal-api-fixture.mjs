import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { PublicKey } from "@solana/web3.js";
import admissions from "../../../shared/evidence/admissions.json" with { type: "json" };

// Jupiter quotes recorded on mainnet, 4 October 2026, for 100 USDC, in each
// stock's own atoms. TQQQx answers with no route, as CATx, PALLx and CRDAx
// did that day, so the unpriceable state is exercised by every run.
const recordedQuotes = { NFLXx: "14749760", AAPLx: "29863749", STRKx: "109429622" };
const symbolOf = new Map(admissions.instruments.map((admission) => [admission.instrument.mint, admission.instrument.symbol]));
// The first quote for each mint is refused with 429 and retry-after: 0, as
// Jupiter's free plan does past one request a second, so every run proves
// the client waits it out instead of reporting a rate limit as a market.
const rateLimited = new Set();
// When each quote arrived, so a test can measure the app's own pacing.
const quoteArrivals = [];
// Activity reports the web routes sent, in arrival order.
const activityReports = [];

const observedAt = "2026-09-29T12:00:00Z";
const meta = {
  served_at: observedAt,
  as_of: observedAt,
  completeness: "complete",
  cluster: "mainnet",
};
const alloyMeta = { ...meta, cluster: "devnet" };
const alloyAddress = "6BD6PprLyhiLeXKTAiLRA2hyMwUqMzpQPzftabQuduQ";
const metadataAlloyAddress = "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d";
const alloy = {
  address: alloyAddress,
  sponsor: "Sponsor1111111111111111111111111111111111111",
  share_mint: "ShareMint11111111111111111111111111111111111",
  id: "1790627156984",
  supply: "1000000",
  locked_genesis: "1000000",
  cluster: "devnet",
  legs: [
    {
      mint: "94L9f6NLadaF9YcDffBw4Ub7tsJb9BJBmFqCUm3zovwH",
      ledger: { atoms: "5000000", scale: 6 },
      pending: { atoms: "0", scale: 6 },
      unclaimed: { atoms: "0", scale: 6 },
      held_back: false,
    },
    {
      mint: "ADcBszQLxMZ4jfcvuTtYpvhDXSeLNHi4MhHFHQrerKyw",
      ledger: { atoms: "3000000", scale: 6 },
      pending: { atoms: "0", scale: 6 },
      unclaimed: { atoms: "1200", scale: 6 },
      held_back: true,
      held_back_reason: "The issuer currently prevents this Hall account from delivering.",
    },
  ],
};
const metadataAlloy = {
  ...alloy,
  address: metadataAlloyAddress,
  metadata: {
    name: "Fixture Alloy",
    symbol: "FIX",
    uri: `https://www.seametry.xyz/alloys/${metadataAlloyAddress}/metadata.json`,
  },
};
// Terms for one whole share (1,000,000 share atoms) of an Alloy whose
// 1,000,000 share atoms hold 5,000,000 and 3,000,000 atoms of its two legs.
const terms = {
  shares: "1000000",
  legs: [
    { stock: alloy.legs[0].mint, amount: { atoms: "5000000", scale: 6 }, kept: { atoms: "0", scale: 6 } },
    { stock: alloy.legs[1].mint, amount: { atoms: "3000000", scale: 6 }, kept: { atoms: "0", scale: 6 } },
  ],
};

function writeJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

// Devnet as the upgradeable loader lays out the register Hall: a Program
// account pointing at its programdata, whose authority is still present.
// Bytes, not a summary, so the page is tested against the parsing it runs live.
const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const hallProgram = new PublicKey("GB1hX1FXQcAUWU23Ji6RtvhTzCKz84ScUsBeD7CqQnjE");
const [hallProgramData] = PublicKey.findProgramAddressSync([hallProgram.toBuffer()], loader);
const fixtureHallAuthority = new PublicKey(Buffer.alloc(32, 7));
const devnetSlot = 455000000;
function devnetAccount(key) {
  if (key === hallProgram.toBase58()) {
    const data = Buffer.alloc(36);
    data.writeUInt32LE(2, 0);
    hallProgramData.toBuffer().copy(data, 4);
    return { data, owner: loader, executable: true };
  }
  if (key === hallProgramData.toBase58()) {
    const data = Buffer.alloc(45);
    data.writeUInt32LE(3, 0);
    data.writeBigUInt64LE(450000000n, 4);
    data[12] = 1;
    fixtureHallAuthority.toBuffer().copy(data, 13);
    return { data, owner: loader, executable: false };
  }
  return null;
}

function devnetRpc(request, response) {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    const call = JSON.parse(body);
    if (call.method !== "getAccountInfo") {
      writeJson(response, 200, { jsonrpc: "2.0", id: call.id, error: { code: -32601, message: `Fixture devnet answers getAccountInfo only, not ${call.method}` } });
      return;
    }
    const account = devnetAccount(call.params[0]);
    writeJson(response, 200, {
      jsonrpc: "2.0",
      id: call.id,
      result: {
        context: { slot: devnetSlot, apiVersion: "2.2.0" },
        value: account && {
          data: [account.data.toString("base64"), "base64"],
          executable: account.executable,
          lamports: 1,
          owner: account.owner.toBase58(),
          rentEpoch: 0,
          space: account.data.length,
        },
      },
    });
  });
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3846");
  const path = url.pathname;
  if (path === "/devnet-rpc") {
    devnetRpc(request, response);
    return;
  }
  if (path === "/jupiter/arrivals") {
    writeJson(response, 200, quoteArrivals);
    return;
  }
  // Execution's activity record, as the Gateway answers it: every report is
  // kept with the secret it carried, so a test reads back exactly what the
  // web routes sent.
  if (path.startsWith("/v1/internal/") && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const parsed = JSON.parse(body);
      activityReports.push({ kind: path.slice("/v1/internal/".length).replace(/^activity\//, ""), secret: request.headers["x-seametry-service-secret"] ?? null, body: parsed });
      if (path !== "/v1/internal/feedback") {
        response.writeHead(204);
        response.end();
      } else if (String(parsed.message).includes("fixture: the gateway fails")) {
        writeJson(response, 500, { title: "Feedback not stored", status: 500, detail: "ReceiveFeedback: fixture failure" });
      } else {
        writeJson(response, 202, { data: { id: "5f0c2f5e-7a1d-4c2b-9b8e-1d2c3b4a5f60" } });
      }
    });
    return;
  }
  if (path === "/fixture/activity") {
    writeJson(response, 200, activityReports);
    return;
  }
  if (path === "/jupiter/quote") {
    quoteArrivals.push(Date.now());
    const outputMint = url.searchParams.get("outputMint");
    if (!rateLimited.has(outputMint)) {
      rateLimited.add(outputMint);
      response.writeHead(429, { "Content-Type": "application/json", "Retry-After": "0" });
      response.end(JSON.stringify({ code: 429, message: "[API Gateway] Too many requests" }));
      return;
    }
    const outAmount = recordedQuotes[symbolOf.get(outputMint)];
    if (!outAmount) {
      writeJson(response, 400, { error: "No routes found", errorCode: "NO_ROUTES_FOUND" });
      return;
    }
    writeJson(response, 200, {
      inAmount: url.searchParams.get("amount"),
      outAmount,
      otherAmountThreshold: outAmount,
      contextSlot: 400000000,
      routePlan: [{ swapInfo: { label: "Fixture" } }],
    });
    return;
  }
  // The auth service as the web proxy reaches it through Caddy, which
  // compresses (server/deploy/Caddyfile), plus a header that Connection marks
  // hop-by-hop. tests/auth-proxy.spec.ts reads it back through the proxy.
  if (path === "/api/auth/get-session") {
    const body = gzipSync(JSON.stringify({ session: null, served_by: "fixture" }));
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "Content-Length": String(body.length),
      Connection: "keep-alive, X-Fixture-Hop",
      "X-Fixture-Hop": "upstream connection only",
      "Set-Cookie": ["fixture-a=1; Path=/; HttpOnly", "fixture-b=2; Path=/; HttpOnly"],
    });
    response.end(body);
    return;
  }
  if (path === "/health") {
    writeJson(response, 200, { state: "fixture" });
    return;
  }
  if (path === "/v1/instruments") {
    writeJson(response, 200, { data: [], meta });
    return;
  }
  if (path === "/v1/alloys") {
    writeJson(response, 200, { data: [alloy], meta: alloyMeta });
    return;
  }
  if (path === `/v1/alloys/${alloyAddress}`) {
    writeJson(response, 200, { data: alloy, meta: alloyMeta });
    return;
  }
  if (path === `/v1/alloys/${metadataAlloyAddress}`) {
    writeJson(response, 200, { data: metadataAlloy, meta: alloyMeta });
    return;
  }
  if (path === `/v1/alloys/${alloyAddress}/strike-cost` || path === `/v1/alloys/${alloyAddress}/melt-proceeds`) {
    const shareAtoms = BigInt(new URL(request.url, "http://fixture").searchParams.get("shares") ?? "1000000");
    const scaled = {
      shares: shareAtoms.toString(),
      legs: terms.legs.map((leg) => ({ ...leg, amount: { ...leg.amount, atoms: (BigInt(leg.amount.atoms) * shareAtoms / 1000000n).toString() } })),
    };
    writeJson(response, 200, { data: scaled, meta: alloyMeta });
    return;
  }

  const match = path.match(/^\/v1\/instruments\/([^/]+)(?:\/(admissibility|depth))?$/);
  if (!match) {
    writeJson(response, 404, { title: "Fixture route absent", detail: path, status: 404 });
    return;
  }

  const mint = decodeURIComponent(match[1]);
  if (match[2] === "admissibility") {
    writeJson(response, 200, {
      data: {
        decision: "BLOCK",
        reasons: [{ code: "UNKNOWN_EXTENSION", severity: "BLOCK", fact: "Extension 91 is not decoded." }],
        policy_version: "policy-2026.09.2",
        input_digest: "047d10ac031522499c5743457489566932288415e96009e380b2fb18a981e109",
      },
      meta,
    });
    return;
  }
  if (match[2] === "depth") {
    writeJson(response, 200, { data: { points: [], reference_index: -1 }, meta });
    return;
  }
  writeJson(response, 200, {
    data: {
      mint,
      symbol: "FIXTURE",
      grade: "Ungraded",
      prerogatives: [],
      unknown_extensions: [91],
      capture: { slot: "371991204", commitment: "confirmed", captured_at: observedAt },
    },
    meta,
  });
});

server.listen(3846, "127.0.0.1");

function close() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
