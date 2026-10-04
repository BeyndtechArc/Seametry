import { expect, test } from "@playwright/test";
import { draftFormula, identityProblem, unitsToAtoms, type QuotedLeg } from "../src/lib/compose/formula";

// Quotes recorded from Jupiter on mainnet, 4 October 2026: what 100 USDC
// (100,000,000 atoms) bought of each stock, in the stock's own atoms.
const nflx: QuotedLeg = { mint: "nflx", symbol: "NFLXx", decimals: 8, quote: { inAtoms: 100_000_000n, outAtoms: 14_749_760n } };
const aapl: QuotedLeg = { mint: "aapl", symbol: "AAPLx", decimals: 8, quote: { inAtoms: 100_000_000n, outAtoms: 29_863_749n } };
const tqqq: QuotedLeg = { mint: "tqqq", symbol: "TQQQx", decimals: 8, quote: { inAtoms: 100_000_000n, outAtoms: 60_337_101n } };

test("equal value divides the share's value evenly and rounds every quantity down", () => {
  const draft = draftFormula([nflx, aapl, tqqq], { method: "value", usdcPerShare: 100_000_000n });
  if ("refused" in draft) throw new Error(draft.refused);
  // 100,000,000 / 3 = 33,333,333 USDC atoms per leg; floor(33,333,333 * 14,749,760 / 100,000,000).
  expect(draft.legs[0].atomsPerShare).toBe(4_916_586n);
  // floor(4,916,586 * 100,000,000 / 14,749,760): rounding down never values a leg above its share.
  expect(draft.legs[0].usdcPerShare).toBe(33_333_328n);
  for (const leg of draft.legs) expect(leg.usdcPerShare).toBeLessThanOrEqual(33_333_333n);
  expect(draft.usdcPerShare).toBe(draft.legs.reduce((sum, leg) => sum + leg.usdcPerShare, 0n));
  expect(draft.legs.map((leg) => leg.weightBps)).toEqual([3333n, 3333n, 3333n]);
});

test("equal units holds the same quantity of each stock, so the dearest stock weighs most", () => {
  const draft = draftFormula([nflx, tqqq], { method: "units", unitsPerShare: "0.1" });
  if ("refused" in draft) throw new Error(draft.refused);
  expect(draft.legs.map((leg) => leg.atomsPerShare)).toEqual([10_000_000n, 10_000_000n]);
  // NFLXx buys fewer units per USDC, so the same quantity is worth more.
  expect(draft.legs[0].weightBps).toBeGreaterThan(draft.legs[1].weightBps);
});

test("a draft refuses rather than rounds a quantity to nothing or past the stock's decimals", () => {
  expect(draftFormula([nflx], { method: "value", usdcPerShare: 1n })).toEqual({ refused: "NFLXx would hold zero atoms per share. Raise the value or quantity per share." });
  expect(unitsToAtoms("0.123456789", 8)).toEqual({ refused: 'This stock carries 8 decimal places; "0.123456789" has 9.' });
  expect(draftFormula([], { method: "value", usdcPerShare: 100_000_000n })).toEqual({ refused: "Choose at least one constituent." });
});

test("the share's name and symbol are checked before they become immutable", () => {
  expect(identityProblem("Technology Five", "TFIV")).toBeUndefined();
  expect(identityProblem("T5", "TFIV")).toBe("A name runs from 3 to 32 characters.");
  expect(identityProblem("Technology Five", "t5")).toBe("A symbol is 2 to 10 capital letters or digits, starting with a letter.");
});

test("the quote route accepts only captured instruments, before it asks Jupiter anything", async ({ request }) => {
  const unknown = await request.get("/api/compose/quotes?mints=So11111111111111111111111111111111111111112");
  expect(unknown.status()).toBe(400);
  expect(await unknown.json()).toEqual({ error: "So11111111111111111111111111111111111111112 is not a captured instrument, so it cannot enter a Formula draft." });
  const none = await request.get("/api/compose/quotes?mints=");
  expect(await none.json()).toEqual({ error: "Expected ?mints= 1 to 12 comma-separated mints, received 0." });
});

test("Compose names an unpriceable constituent, then drafts the Formula and its founding text", async ({ page }) => {
  // The fixture Jupiter answers with the recorded quotes and no route for TQQQx.
  await page.goto("/app/compose");
  const main = page.getByRole("main");
  const sheet = main.getByTestId("formula-draft");
  await expect(sheet.getByRole("status")).toHaveText("TQQQx has no quote. No mainnet route buys it with USDC right now.");

  await main.getByRole("checkbox", { name: /TQQQx/ }).uncheck();
  const nflx = sheet.getByRole("row", { name: /NFLXx/ });
  // 100 USDC over two legs is 50,000,000 atoms each; floor(50,000,000 * 14,749,760 / 100,000,000).
  await expect(nflx.locator("td").nth(0)).toHaveText("0.07374880");
  await expect(nflx.locator("td").nth(1)).toHaveText("50.000000 USDC");
  await expect(sheet.getByText(/^Jupiter quote, mainnet, 100 USDC per constituent, observed \d+s ago\./)).toBeVisible();
  await expect(sheet.locator("pre")).toHaveCount(0);

  await main.getByLabel("Name", { exact: true }).fill("Technology Five");
  await main.getByLabel("Symbol", { exact: true }).fill("tfiv");
  await expect(main.getByLabel("Symbol", { exact: true })).toHaveValue("TFIV");
  const founding = sheet.locator("pre");
  await expect(founding).toContainText('"symbol": "TFIV"');
  await expect(founding).toContainText('"atomsPerShare"');
  await expect(founding).toContainText('"network": "devnet"');
});
