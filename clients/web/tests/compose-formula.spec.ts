import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { draftFormula, identityProblem, unitsToAtoms, type QuotedLeg } from "../src/lib/compose/formula";
import { FOUNDING, requestProblem } from "../src/lib/request-problem";
import { UNREGISTERED_SPONSOR_MARK } from "../src/lib/compose/founding-transaction";
import { registeredMetadataPath, registeredMetadataUri } from "../src/lib/compose/identity";
import { REGISTER_HALL_PROGRAM_ID } from "../src/lib/hall/constants";
import { slidingWindow } from "../src/lib/request-window";
import { registerTestWallet } from "./test-wallet";

// How long a page may take to show quotes. lib/jupiter lets ten calls leave
// in any ten seconds, the fixture refuses each mint's first quote with 429,
// and other workers quote through the same server at the same time.
const QUOTED = 30_000;
test.describe.configure({ timeout: 60_000 });

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

test("each founded Alloy gets an address-specific metadata URI", () => {
  const address = "6BD6PprLyhiLeXKTAiLRA2hyMwUqMzpQPzftabQuduQ";
  expect(registeredMetadataPath(address)).toBe(`/alloys/${address}/metadata.json`);
  expect(registeredMetadataUri(address)).toBe(`https://www.seametry.xyz/alloys/${address}/metadata.json`);
});

test("Compose stops at the twelve legs an Alloy can hold", async ({ page }) => {
  await page.goto("/app/compose");
  const main = page.getByRole("main");
  const admitted = main.locator("li:not([data-refused]) input[type=checkbox]");
  // count() does not wait, and the page streams in behind its loading boundary.
  await expect(admitted.first()).toBeVisible();
  expect(await admitted.count()).toBeGreaterThan(12);
  for (let i = 0; i < 12; i++) await admitted.nth(i).check();
  await expect(main.locator("output")).toHaveText("12/12");
  await expect(admitted.nth(12)).toBeDisabled();
  await admitted.nth(0).uncheck();
  await expect(admitted.nth(12)).toBeEnabled();
});

// Every published Alloy, by the directory its URI names. A share mint's URI is
// locked at founding, so a directory missing here, or a file drifting from the
// hash its metadata states, has to fail before anyone founds with it.
const published = {
  "stoic-crew": { name: "Stoic Crew", symbol: "STOIC" },
  "fortune-five": { name: "Fortune Five", symbol: "FFF" },
};

test("every published Alloy's metadata is served whole, and its image is the one it names", async ({ request }) => {
  expect(readdirSync("public/alloys").sort()).toEqual(Object.keys(published).sort());
  for (const [slug, identity] of Object.entries(published)) {
    const metadata = await request.get(`/alloys/${slug}/metadata.json`);
    expect(metadata.status(), slug).toBe(200);
    const body = await metadata.json();
    expect({ name: body.name, symbol: body.symbol }).toEqual(identity);
    expect(identityProblem(body.name, body.symbol)).toBeUndefined();
    const file = body.properties.files[0];
    expect(body.image).toBe(file.uri);
    const image = await request.get(new URL(file.uri).pathname);
    expect(image.headers()["content-type"], slug).toBe("image/png");
    expect(createHash("sha256").update(await image.body()).digest("hex"), slug).toBe(file.sha256);
  }
});

test("a visitor's founding does not claim Seametry's sponsor mark", () => {
  expect(Array.from(UNREGISTERED_SPONSOR_MARK)).toEqual(Array(32).fill(0));
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
  expect((await refused({ name: "New Alloy", symbol: "NEW" })).error).toContain("HALL_DEMO_FUNDER_SECRET_KEY is not set");
});

test("an address-specific metadata URL reads only a matching on-chain Alloy", async ({ request }) => {
  const address = "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d";
  const published = await request.get(`/alloys/${address}/metadata.json`);
  expect(published.status()).toBe(200);
  const metadata = await published.json();
  expect(metadata).toMatchObject({ name: "Fixture Alloy", symbol: "FIX", description: expect.any(String) });
  expect(metadata.image).toBeUndefined();
  const unknown = await request.get("/alloys/So11111111111111111111111111111111111111112/metadata.json");
  expect(unknown.status()).toBe(404);
});

test("Compose offers founding once the draft is priced and named, and holds the Key until a wallet logs in", async ({ page }) => {
  await page.goto("/app/compose");
  const main = page.getByRole("main");
  for (const symbol of ["NFLXx", "AAPLx"]) await main.getByRole("checkbox", { name: new RegExp(symbol) }).check();
  await main.getByRole("button", { name: "Set the Formula" }).click();
  await main.getByLabel("Name", { exact: true }).fill("Stoic Crew");
  await main.getByLabel("Symbol", { exact: true }).fill("STOIC");
  const founding = main.getByTestId("founding");
  await expect(founding.getByRole("heading", { level: 3, name: "Found Stoic Crew" })).toBeVisible({ timeout: QUOTED });
  await expect(founding.getByText("Assigned from this Alloy's address at founding", { exact: true })).toBeVisible();
  // The Key sits in the step bar with the flow's other next moves, and the bar says why it waits.
  await expect(main.getByRole("button", { name: "Found on devnet" })).toBeDisabled();
  await expect(founding.getByRole("button", { name: "Found on devnet" })).toHaveCount(0);
  await expect(main.getByText("Log in with a devnet wallet: it signs as the sponsor.", { exact: true })).toBeVisible();
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
  expect(createHash("sha256").update(await served.body()).digest("hex")).toBe(aapl.stored_sha256 ?? aapl.sha256);
});

test("ticking several boxes in a row asks for quotes once, after the selection settles", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (sent) => {
    if (sent.url().includes("/api/compose/quotes")) asked.push(sent.url());
  });
  await page.goto("/app/compose");
  const main = page.getByRole("main");
  for (const symbol of ["NFLXx", "AAPLx"]) await main.getByRole("checkbox", { name: new RegExp(symbol) }).check();
  await expect(main.getByTestId("formula-draft").getByRole("row", { name: /AAPLx/ })).toBeVisible({ timeout: QUOTED });
  expect(asked).toHaveLength(1);
});

test("a quote asked again within its lifetime is the same observation, not a new call", async ({ request }) => {
  const mints = JSON.parse(readFileSync("../../shared/evidence/admissions.json", "utf8")).instruments;
  const nflx = mints.find((admission: { instrument: { symbol: string } }) => admission.instrument.symbol === "NFLXx").instrument.mint;
  const first = await (await request.get(`/api/compose/quotes?mints=${nflx}`)).json();
  const second = await (await request.get(`/api/compose/quotes?mints=${nflx}`)).json();
  expect(second.quotes[0].observedAt).toBe(first.quotes[0].observedAt);
  expect(second.observedAt).toBe(first.observedAt);
});

test("ten requests leave at once and every later one waits for the oldest to leave the window", () => {
  const next = slidingWindow(10, 10_000);
  const granted = Array.from({ length: 12 }, () => next(1_000));
  expect(granted.slice(0, 10)).toEqual(Array(10).fill(1_000));
  expect(granted.slice(10)).toEqual([11_000, 11_000]);
  // Once the window has passed, a request goes when it is asked for.
  expect(next(30_000)).toBe(30_000);
});

test("the server never sends Jupiter more than ten calls in any ten seconds, however many requests overlap", async ({ request }) => {
  test.setTimeout(90_000);
  const admitted = JSON.parse(readFileSync("../../shared/evidence/admissions.json", "utf8")).instruments.map((admission: { instrument: { mint: string } }) => admission.instrument.mint);
  // Six overlapping requests for mints no other test quotes, so none is
  // cached. The fixture refuses each first quote, so they make twelve calls,
  // more than the window holds.
  await Promise.all(admitted.slice(-6).map((mint: string) => request.get(`/api/compose/quotes?mints=${mint}`)));
  const arrivals: number[] = await (await request.get("http://127.0.0.1:3846/jupiter/arrivals")).json();
  expect(arrivals.length).toBeGreaterThan(10);
  // The window is 10,250 ms; the fixture times arrivals, which local
  // scheduling jitter can pull a few milliseconds closer. Unpaced,
  // overlapping requests would put all twelve inside one second.
  const spans = arrivals.slice(10).map((at, index) => at - arrivals[index]);
  expect(Math.min(...spans)).toBeGreaterThanOrEqual(10_000);
});

test("pressing Found separates progress from the final stopped outcome", async ({ page }) => {
  // The test server has no funder key, so preparation stops at step one.
  await registerTestWallet(page, { trusted: true });
  await page.goto("/app/compose");
  await page.getByText("Sign in", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(page.getByLabel(/Wallet 4vJ9/)).toBeVisible();

  const main = page.getByRole("main");
  for (const symbol of ["NFLXx", "AAPLx"]) await main.getByRole("checkbox", { name: new RegExp(symbol) }).check();
  await main.getByRole("button", { name: "Set the Formula" }).click();
  await main.getByLabel("Name", { exact: true }).fill("Stoic Crew");
  await main.getByLabel("Symbol", { exact: true }).fill("STOIC");
  await main.getByRole("button", { name: "Found on devnet" }).click({ timeout: QUOTED });

  const outcome = page.getByRole("dialog", { name: "Founding stopped" });
  await expect(outcome).toBeVisible({ timeout: QUOTED });
  await expect(outcome.getByRole("alert")).toContainText("Nothing was founded");
  await outcome.getByText("Technical detail").click();
  await expect(outcome.getByText("HALL_DEMO_FUNDER_SECRET_KEY is not set", { exact: false })).toBeVisible();
  await expect(outcome.getByRole("button", { name: "Try founding again" })).toBeVisible();
  // Outcomes are watched, not worked in, so the dialog is centred rather than an end sheet.
  const box = (await outcome.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  await outcome.getByRole("button", { name: "Close founding outcome" }).click();
  await expect(outcome).toBeHidden();
  await expect(main.getByRole("button", { name: "Read why the founding stopped" })).toBeVisible();
});

test("every stopped founding says what did not happen, and keeps the raw message beside it", () => {
  const slot = new Error('Transaction simulation failed: Error processing Instruction 0: invalid instruction data. Logs: [ "Program log: 507896021 is not a recent slot" ]');
  const prepare = requestProblem(FOUNDING, "prepare", slot);
  expect(prepare.plain).toBe("Devnet refused one of the transactions that prepare your stand-ins. Nothing was founded and your wallet was not asked to sign. Try again in a minute.");
  expect(prepare.technical).toBe(`Error: ${slot.message}`);

  const declined = requestProblem(FOUNDING, "sign", Object.assign(new Error("User rejected the request."), { name: "WalletSignTransactionError", error: { code: 4001, message: "User rejected the request." } }));
  expect(declined.plain).toContain("You declined to sign, so nothing was founded");
  expect(declined.technical).toBeUndefined();

  // Adapters raise every signing failure under the same name; only the wallet's rejection is a decline.
  const failed = requestProblem(FOUNDING, "sign", Object.assign(new Error("Unexpected error"), { name: "WalletSignTransactionError", error: { code: -32603, message: "Unexpected error" } }));
  expect(failed.plain).not.toContain("declined");
  expect(failed.plain).toContain("must be Solana Devnet, not Testnet");
  expect(failed.technical).toBe('WalletSignTransactionError: Unexpected error\nCause: {"code":-32603,"message":"Unexpected error"}');

  expect(requestProblem(FOUNDING, "build", new Error("failed to get info about account FWnN")).plain).toContain("could not be assembled from devnet");

  expect(requestProblem(FOUNDING, "confirm", new Error("The Hall refused the transaction: {\"InstructionError\":[2,{\"Custom\":6003}]}")).plain).toContain("the network fee for the attempt was spent");
  expect(requestProblem(FOUNDING, "confirm", new Error("Transaction was not confirmed in 30.00 seconds")).plain).toContain("It may still land");
  expect(requestProblem(FOUNDING, "confirm", new Error("Transaction 53Zh did not land: its blockhash expired before devnet received it.")).plain).toContain("never received the signed founding");
  expect(requestProblem(FOUNDING, "prepare", new TypeError("Failed to fetch")).plain).toContain("could not be reached");
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
  await expect(main.locator("output")).toHaveText("0/12");
  await expect(main.getByTestId("selection-action-bar")).toHaveCSS("align-items", "center");
  await expect(sheet.getByText("Choose at least one constituent.", { exact: true })).toBeVisible();
  for (const symbol of ["NFLXx", "AAPLx", "TQQQx"]) await main.getByRole("checkbox", { name: new RegExp(symbol) }).check();
  await expect(sheet.getByRole("status")).toHaveText("TQQQx has no quote. No mainnet route buys it with USDC right now.", { timeout: QUOTED });

  await main.getByRole("checkbox", { name: /TQQQx/ }).uncheck();
  const nflx = sheet.getByRole("row", { name: /NFLXx/ });
  // 100 USDC over two legs is 50,000,000 atoms each; floor(50,000,000 * 14,749,760 / 100,000,000).
  await expect(nflx.locator("td").nth(0)).toHaveText("0.07374880", { timeout: QUOTED });
  await expect(nflx.locator("td").nth(1)).toHaveText("50.000000 USDC");
  await expect(sheet.getByText(/^Jupiter quote, mainnet, 100 USDC per constituent, observed \d+s ago\./)).toBeVisible();
  await expect(sheet.locator("pre")).toHaveCount(0);

  await main.getByRole("button", { name: "Set the Formula" }).click();
  await main.getByLabel("Name", { exact: true }).fill("Technology Five");
  await main.getByLabel("Symbol", { exact: true }).fill("tfiv");
  await expect(main.getByLabel("Symbol", { exact: true })).toHaveValue("TFIV");
  const founding = sheet.locator("pre");
  await expect(founding).toContainText('"symbol": "TFIV"');
  await expect(founding).toContainText('"atomsPerShare"');
  await expect(founding).toContainText('"network": "devnet"');
});

test("the Formula's action bar rides its column as Allocation's does: in view, beside the Draft, above the phone tabs", async ({ page }) => {
  await page.goto("/app/compose");
  // Scoped to main and awaited: while the page streams, React holds its
  // finished content in a hidden node at the end of the body, a second copy
  // a measurement taken too early would find.
  const main = page.getByRole("main");
  const bar = main.getByTestId("selection-action-bar");
  const draft = main.getByTestId("formula-draft");
  await expect(bar).toBeVisible();
  await expect(draft).toBeVisible();
  await page.mouse.wheel(0, 600);
  const [barBox, draftBox] = [await bar.boundingBox(), await draft.boundingBox()];
  // Pinned to the foot of the viewport while the list scrolls, and never under the Draft rail.
  expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(barBox!.y + barBox!.height).toBeGreaterThan(page.viewportSize()!.height - 80);
  expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(draftBox!.x);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.wheel(0, 400);
  const tabs = await page.getByRole("navigation", { name: "Mobile product" }).boundingBox();
  const phoneBar = await bar.boundingBox();
  expect(phoneBar!.y + phoneBar!.height).toBeLessThanOrEqual(tabs!.y);
});
