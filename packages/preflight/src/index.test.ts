import assert from "node:assert/strict";
import test from "node:test";
import type { Instrument } from "@seametry/domain";
import { derivePreflight } from "./index.ts";

const instrument: Instrument = { symbol: "SPYx", underlying: "SPY", mint: "spy", decimals: 8 };

test("clears when issuer and two references agree", () => {
  const result = derivePreflight({
    instrument,
    now: new Date("2026-09-13T12:00:00Z"),
    observations: [
      { source: "issuer", state: "live", observedAt: "2026-09-13T11:59:59Z" },
      { source: "chainlink", state: "live", price: 600, observedAt: "2026-09-13T11:59:59Z" },
      { source: "stork", state: "live", price: 601, observedAt: "2026-09-13T11:59:59Z" }
    ],
    maxReferenceDivergencePct: 0.5
  });
  assert.equal(result.status, "clear");
});

test("blocks a halted issuer even when a route exists", () => {
  const result = derivePreflight({
    instrument,
    now: new Date("2026-09-13T12:00:00Z"),
    observations: [{ source: "issuer", state: "halted", observedAt: "2026-09-13T11:59:59Z" }]
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.flags.includes("issuer-halt"));
});

test("surfaces missing references rather than inventing certainty", () => {
  const result = derivePreflight({ instrument, observations: [] });
  assert.equal(result.status, "caution");
  assert.ok(result.flags.includes("reference-missing"));
});
