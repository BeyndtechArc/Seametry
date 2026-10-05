import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { draftFormula, identityProblem, unitsToAtoms, type QuotedLeg } from "../src/lib/compose/formula";
import { SEAMETRY_SPONSOR_MARK } from "../src/lib/compose/founding-transaction";
import { REGISTER_HALL_PROGRAM_ID } from "../src/lib/hall/constants";

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

test("Compose stops at the twelve legs an Alloy can hold", async ({ page }) => {
  await page.goto("/app/compose");
  const main = page.getByRole("main");
  const admitted = main.locator("li:not([data-refused]) input[type=checkbox]");
  // count() does not wait, and the page streams in behind its loading boundary.
  await expect(admitted.first()).toBeVisible();
  expect(await admitted.count()).toBeGreaterThan(12);
  for (let i = 0; i < 12; i++) await admitted.nth(i).check();
  await expect(main.getByText("12 of at most 12 chosen. An Alloy holds no more legs than this; remove one to choose another.", { exact: true })).toBeVisible();
  await expect(admitted.nth(12)).toBeDisabled();
  await admitted.nth(0).uncheck();
  await expect(admitted.nth(12)).toBeEnabled();
});

test("Stoic Crew's metadata is served whole, and its image is the one it names", async ({ request }) => {
  const metadata = await request.get("/alloys/stoic-crew/metadata.json");
  expect(metadata.status()).toBe(200);
  const body = await metadata.json();
  expect({ name: body.name, symbol: body.symbol }).toEqual({ name: "Stoic Crew", symbol: "STOIC" });
  expect(identityProblem(body.name, body.symbol)).toBeUndefined();
  const file = body.properties.files[0];
  expect(body.image).toBe(file.uri);
  const image = await request.get(new URL(file.uri).pathname);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(createHash("sha256").update(await image.body()).digest("hex")).toBe(file.sha256);
});

test("the founding records the sponsor mark by its file's hash, on the register's Hall", () => {
  const mark = createHash("sha256").update(readFileSync("public/sponsor-mark.svg")).digest("hex");
  expect(SEAMETRY_SPONSOR_MARK).toBe(mark);
  const server = /HallDevnetProgramID = "([1-9A-HJ-NP-Za-km-z]{32,44})"/.exec(readFileSync("../../server/internal/basket/chain.go", "utf8"))?.[1];
  expect(REGISTER_HALL_PROGRAM_ID.toBase58()).toBe(server);
});

test("the founding route refuses what would be permanent and wrong, before it spends anything", async ({ request }) => {
  const sponsor = "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d";
  const aapl = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
  const refused = async (body: object) => {
    const response = await request.post("/api/compose/found", { data: { sponsor, name: "Stoic Crew", symbol: "STOIC", legs: [{ mint: aapl, atomsPerShare: "5956730" }], ...body } });
    return { status: response.status(), error: (await response.json()).error };
  };
  expect(await refused({ legs: [{ mint: "So11111111111111111111111111111111111111112", atomsPerShare: "1" }] })).toEqual({
    status: 400,
    error: "So11111111111111111111111111111111111111112 is not admitted by the policy engine, so it cannot enter a founded Formula.",
  });
  expect((await refused({ legs: Array.from({ length: 13 }, () => ({ mint: aapl, atomsPerShare: "1" })) })).error).toBe("A Formula holds 1 to 12 constituents; this one has 13.");
  expect(await refused({ name: "Unpublished Alloy", symbol: "UNPUB" })).toEqual({
    status: 409,
    error: "No metadata is published at /alloys/unpublished-alloy/metadata.json, so Unpublished Alloy has no URI to found with yet.",
  });
  expect(await refused({ symbol: "STOICX" })).toEqual({
    status: 409,
    error: "The metadata at /alloys/stoic-crew/metadata.json describes Stoic Crew (STOIC), not Stoic Crew (STOICX).",
  });
});

test("Compose offers founding once the draft is priced and named, and holds the Key until a wallet logs in", async ({ page }) => {
  await page.goto("/app/compose");
  const main = page.getByRole("main");
  for (const symbol of ["NFLXx", "AAPLx"]) await main.getByRole("checkbox", { name: new RegExp(symbol) }).check();
  await main.getByLabel("Name", { exact: true }).fill("Stoic Crew");
  await main.getByLabel("Symbol", { exact: true }).fill("STOIC");
  const founding = main.getByTestId("founding");
  await expect(founding.getByRole("heading", { level: 3, name: "Found Stoic Crew" })).toBeVisible();
  await expect(founding.getByText("https://www.seametry.xyz/alloys/stoic-crew/metadata.json", { exact: true })).toBeVisible();
  await expect(founding.getByRole("button", { name: "Found on devnet" })).toBeDisabled();
  await expect(founding.getByText("Log in with a devnet wallet: it signs as the sponsor.", { exact: true })).toBeVisible();
});

test("each lot draws the logo its mint names, served exactly as the capture recorded it", async ({ page, request }) => {
  const manifest = JSON.parse(readFileSync("../../shared/evidence/instrument-logos.json", "utf8"));
  const aapl = manifest.logos.find((logo: { symbol: string }) => logo.symbol === "AAPLx");
  expect(aapl.state).toBe("captured");

  await page.goto("/app/compose");
  const candidate = page.getByRole("main").getByRole("listitem").filter({ has: page.getByText("AAPLx", { exact: true }) });
  await expect(candidate.getByTestId("lot-mark")).toHaveAttribute("src", aapl.path);

  const served = await request.get(aapl.path);
  expect(served.status()).toBe(200);
  expect(createHash("sha256").update(await served.body()).digest("hex")).toBe(aapl.sha256);
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
  await expect(main.getByText("0 of at most 12 chosen.", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Choose at least one constituent.", { exact: true })).toBeVisible();
  for (const symbol of ["NFLXx", "AAPLx", "TQQQx"]) await main.getByRole("checkbox", { name: new RegExp(symbol) }).check();
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
