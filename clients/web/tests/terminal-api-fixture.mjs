import { createServer } from "node:http";

const observedAt = "2026-09-29T12:00:00Z";
const meta = {
  served_at: observedAt,
  as_of: observedAt,
  completeness: "complete",
  cluster: "mainnet",
};

function writeJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1:3846").pathname;
  if (path === "/health") {
    writeJson(response, 200, { state: "fixture" });
    return;
  }
  if (path === "/v1/instruments") {
    writeJson(response, 200, { data: [], meta });
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
