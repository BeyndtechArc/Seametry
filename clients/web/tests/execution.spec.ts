import { expect, test } from "@playwright/test";
import { USDC_MINT } from "../src/lib/allocation/rules";
import {
  allocationHoldings,
  deriveState,
  DROP_MARGIN_BLOCKS,
  DROPPED_AFTER_MS,
  judgeLeg,
  migrateLegacy,
  nextAction,
  outcomeLine,
  receivedFrom,
  retryWeights,
  UNREADABLE_AFTER_MS,
  type Execution,
  type Leg,
} from "../src/lib/execution/record";

// The engine's rules without a network or a browser
// (.plan/execution-and-interface-system.plan.md, section 3).

const SIGNED_AT = "2026-10-14T12:00:00.000Z";
const T0 = Date.parse(SIGNED_AT);

function leg(phase: Leg["phase"], extra: Partial<Leg> = {}): Leg {
  return { signature: `sig-${Math.random()}`, mint: "mint-a", symbol: "AAA", spend: { atoms: "1000000", scale: 6, unit: "USDC" }, phase, signedAt: SIGNED_AT, ...extra };
}

function record(legs: Leg[], extra: Partial<Execution> = {}): Execution {
  return { id: "x", kind: "buy", wallet: "w", network: "mainnet", subject: "Prime Seven", legs, createdAt: SIGNED_AT, seen: false, ...extra };
}

test("an unseen signature is dropped only once the chain is past its last valid height and the margin", () => {
  const deadline = { lastValidBlockHeight: 1_000, signedAt: SIGNED_AT };
  expect(judgeLeg(null, 1_000 + DROP_MARGIN_BLOCKS, deadline, T0)).toEqual({ phase: "sent" });
  expect(judgeLeg(null, 1_000 + DROP_MARGIN_BLOCKS + 1, deadline, T0)).toEqual({ phase: "dropped" });
});

test("a seen signature is judged by its own status, whatever the height", () => {
  const deadline = { lastValidBlockHeight: 1_000, signedAt: SIGNED_AT };
  expect(judgeLeg({ err: null, confirmationStatus: "confirmed" }, 5_000, deadline, T0)).toEqual({ phase: "landed" });
  expect(judgeLeg({ err: null, confirmationStatus: "finalized" }, 5_000, deadline, T0)).toEqual({ phase: "landed" });
  expect(judgeLeg({ err: null, confirmationStatus: "processed" }, 5_000, deadline, T0)).toEqual({ phase: "sent" });
  expect(judgeLeg({ err: { InstructionError: [2, { Custom: 6001 }] }, confirmationStatus: "confirmed" }, 5_000, deadline, T0))
    .toEqual({ phase: "failed", technical: '{"InstructionError":[2,{"Custom":6001}]}' });
});

test("a record kept from before block height deadlines falls back to wall time", () => {
  const deadline = { signedAt: SIGNED_AT };
  expect(judgeLeg(null, 10_000_000, deadline, T0 + DROPPED_AFTER_MS)).toEqual({ phase: "sent" });
  expect(judgeLeg(null, 10_000_000, deadline, T0 + DROPPED_AFTER_MS + 1)).toEqual({ phase: "dropped" });
});

test("a record's state comes from its legs, and unreadable turns to needs-attention only after the grace", () => {
  expect(deriveState(record([leg("landed"), leg("sent")]), T0)).toBe("settling");
  expect(deriveState(record([leg("landed"), leg("landed")]), T0)).toBe("settled");
  expect(deriveState(record([leg("landed"), leg("dropped")]), T0)).toBe("partly-settled");
  expect(deriveState(record([leg("refused"), leg("failed")]), T0)).toBe("nothing-moved");
  const unreadable = record([leg("sent")], { unreadable: { since: SIGNED_AT, detail: "502" } });
  expect(deriveState(unreadable, T0 + UNREADABLE_AFTER_MS)).toBe("settling");
  expect(deriveState(unreadable, T0 + UNREADABLE_AFTER_MS + 1)).toBe("needs-attention");
  // Unreadable means nothing once every leg has ended.
  expect(deriveState(record([leg("landed")], { unreadable: { since: SIGNED_AT, detail: "502" } }), T0 + 10 * UNREADABLE_AFTER_MS)).toBe("settled");
});

test("the next action is the one the state allows: nothing while settling, a retry of exactly what did not land", () => {
  const landed = leg("landed", { mint: "a" });
  const dropped = leg("dropped", { mint: "b" });
  expect(nextAction(record([landed, leg("sent")]), T0)).toEqual({ kind: "none" });
  expect(nextAction(record([landed]), T0)).toEqual({ kind: "view-holdings" });
  expect(nextAction(record([landed, dropped]), T0)).toEqual({ kind: "retry", legs: [dropped] });
  const stuck = leg("sent");
  expect(nextAction(record([stuck], { unreadable: { since: SIGNED_AT, detail: "" } }), T0 + UNREADABLE_AFTER_MS + 1)).toEqual({ kind: "read-chain", signature: stuck.signature });
});

test("retry weights reproduce unequal spends in whole percents summing to 100, and equal spends need none", () => {
  const spend = (mint: string, atoms: string) => leg("dropped", { mint, spend: { atoms, scale: 6, unit: "USDC" } });
  expect(retryWeights([spend("a", "1000000"), spend("b", "1000000")])).toBeUndefined();
  // 40, 10 and 10 of 60 floor to 66, 16 and 16; the two left go to the equal largest remainders in order.
  expect(retryWeights([spend("a", "40000000"), spend("b", "10000000"), spend("c", "10000000")])).toEqual({ a: "67", b: "17", c: "16" });
  const three = retryWeights([spend("a", "1"), spend("b", "1"), spend("c", "2")])!;
  expect(Object.values(three).reduce((sum, value) => sum + Number(value), 0)).toBe(100);
});

test("what was received is the bought token on a buy and USDC on a sale, never a negative change", () => {
  const changes = [{ mint: "mint-a", atoms: "4000", scale: 8 }, { mint: USDC_MINT, atoms: "-1000000", scale: 6 }];
  expect(receivedFrom("buy", { mint: "mint-a", symbol: "AAA" }, changes)).toEqual({ atoms: "4000", scale: 8, unit: "AAA" });
  expect(receivedFrom("sell", { mint: "mint-a", symbol: "AAA" }, changes)).toBeUndefined();
  expect(receivedFrom("sell", { mint: "mint-a", symbol: "AAA" }, [{ mint: USDC_MINT, atoms: "990000", scale: 6 }])).toEqual({ atoms: "990000", scale: 6, unit: "USDC" });
});

test("Allocation holdings add what buys received and subtract what sales spent, landed legs only", () => {
  const allocation = { id: "alloc", name: "Prime Seven", templateId: "prime-seven" };
  const bought = record([
    leg("landed", { mint: "a", symbol: "A", received: { atoms: "400", scale: 8, unit: "A" } }),
    leg("landed", { mint: "b", symbol: "B", received: { atoms: "250", scale: 8, unit: "B" } }),
    leg("dropped", { mint: "c", symbol: "C" }),
  ], { id: "buy", allocation });
  const sold = record([leg("landed", { mint: "a", symbol: "A", spend: { atoms: "400", scale: 8, unit: "A" } })], { id: "sell", kind: "sell", allocation, createdAt: "2026-10-14T13:00:00.000Z" });
  expect(allocationHoldings([sold, bought], "w")).toEqual([{ ...allocation, createdAt: SIGNED_AT, legs: [{ mint: "b", symbol: "B", atoms: "250", scale: 8 }] }]);
  expect(allocationHoldings([bought], "another wallet")).toEqual([]);
});

test("the trade list kept before the engine becomes one record per decision", () => {
  const trade = (signature: string, at: string, extra = {}) => ({
    signature, wallet: "w", mint: `m-${signature}`, symbol: signature.toUpperCase(), direction: "buy" as const,
    inputAtoms: "1000000", inputScale: 6, submittedAt: at, allocationId: "alloc", allocationName: "Prime Seven", ...extra,
  });
  const migrated = migrateLegacy([
    trade("a", "2026-10-14T12:00:00.000Z", { settled: true, settledAtoms: "400", settledScale: 8 }),
    trade("b", "2026-10-14T12:00:05.000Z"),
    trade("c", "2026-10-14T12:30:00.000Z", { direction: "sell", allocationId: "alloc" }),
    trade("d", "2026-10-14T13:00:00.000Z", { allocationId: undefined, allocationName: undefined }),
  ]);
  expect(migrated.map((entry) => [entry.kind, entry.subject, entry.legs.map((item) => item.signature)])).toEqual([
    ["buy", "D", ["d"]],
    ["sell", "Prime Seven", ["c"]],
    ["buy", "Prime Seven", ["a", "b"]],
  ]);
  const bought = migrated[2];
  expect(bought.legs[0]).toMatchObject({ phase: "landed", received: { atoms: "400", scale: 8, unit: "A" } });
  // Unsettled when recorded, so the watcher reads it again; with no block height it is judged by wall time.
  expect(bought.legs[1]).toMatchObject({ phase: "sent" });
  expect(bought.legs[1].lastValidBlockHeight).toBeUndefined();
  expect(migrated.every((entry) => entry.seen)).toBe(true);
});

test("an outcome names the shared reason the missed legs share, and whether anything was charged", () => {
  const slipped = { plain: "The price moved more than the 0.50% slippage limit between the quote and sending, so mainnet's check stopped it. Nothing moved." };
  const shared = record([leg("landed"), leg("refused", { problem: slipped }), leg("refused", { problem: slipped })]);
  expect(outcomeLine(shared, T0)).toBe(`1 landed; 2 did not. ${slipped.plain}`);
  const mixed = record([leg("landed"), leg("refused", { problem: slipped }), leg("dropped", { problem: { plain: "Its deadline passed." } })]);
  expect(outcomeLine(mixed, T0)).toBe("1 landed; 2 did not. Each ended its own way; Activity has each reason. Nothing was charged for them.");
  const rejected = record([leg("failed", { problem: { plain: "Mainnet rejected it after it was sent." } }), leg("failed", { problem: { plain: "Mainnet rejected it after it was sent." } })]);
  expect(outcomeLine(rejected, T0)).toBe("Nothing changed hands. Mainnet rejected it after it was sent. A rejected transaction still paid its network fee.");
});
