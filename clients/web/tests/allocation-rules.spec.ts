import { expect, test } from "@playwright/test";
import { Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { describeSplit, formatAmount, formatBalance, parseAmount, splitByWeights, splitEvenly } from "../src/lib/amount";
import { admissions, isAdmitted, partitionAdmissions } from "../src/lib/allocation/admissions";
import { findAllocationIndex } from "../src/lib/allocation/indexes";
import { messageDigest, openApproval, signApproval, type ApprovalTerms } from "../src/lib/allocation/approval";
import { carriesSenderTip, composeSwap, senderTipAccount } from "../src/lib/allocation/sender";
import { LOADED_DATA_LIMIT_MAX_BYTES, SENDER_TIP_ACCOUNTS, SENDER_TIP_LAMPORTS, TRANSACTION_SIZE_LIMIT, countryGate, loadedDataLimit, failedVenueProgram, preflightRefusal, feeSchedule, lotCapAtoms, minimumPlanAtoms, quoteParams, routingFeeAtoms, routingFeeBps, sellQuoteParams, tipOffsetBps, unlistedProgram, USDC_MINT } from "../src/lib/allocation/rules";
import { listedPositions } from "../src/lib/allocation/positions";
import { registerTestWallet } from "./test-wallet";
import { acceptSubmits, answerChain, preparedLeg } from "./execution-fixture";

// Pure rules only: no build, no wallet, no network. The route handlers that
// call these reach Jupiter and mainnet, which a test here cannot.

test("amounts parse to exact atoms and refuse what the scale cannot hold", () => {
  expect(parseAmount("250", 6)).toEqual({ atoms: 250_000_000n });
  expect(parseAmount("1,000.5", 6)).toEqual({ atoms: 1_000_500_000n });
  expect(parseAmount("0.000001", 6)).toEqual({ atoms: 1n });
  expect("refused" in parseAmount("0.0000001", 6)).toBe(true);
  expect("refused" in parseAmount("-5", 6)).toBe(true);
  expect("refused" in parseAmount("1e3", 6)).toBe(true);
});

test("amounts format with separators, every digit of the scale, and a true minus", () => {
  expect(formatAmount("1234567890", 6)).toBe("1,234.567890");
  expect(formatAmount("5", 6)).toBe("0.000005");
  expect(formatAmount(-2500000n, 6)).toBe("−2.500000");
  expect(formatAmount("1000", 0)).toBe("1,000");
});

test("the wallet header drops only insignificant zeroes", () => {
  expect(formatBalance("0", 9)).toBe("0");
  expect(formatBalance("1234000000", 9)).toBe("1.234");
  expect(formatBalance("1", 9)).toBe("0.000000001");
  expect(formatBalance("123456789000000", 6)).toBe("123,456,789");
});

test("an even split sums to the total exactly, remainder to the first shares", () => {
  expect(splitEvenly(10n, 3)).toEqual([4n, 3n, 3n]);
  expect(splitEvenly(9n, 3)).toEqual([3n, 3n, 3n]);
  const parts = splitEvenly(1_000_000_001n, 7);
  expect(parts.reduce((sum, part) => sum + part, 0n)).toBe(1_000_000_001n);
  expect(splitEvenly(5n, 0)).toEqual([]);
});

test("a weighted split sums to the total exactly, leftover atoms to the largest remainders", () => {
  expect(splitByWeights(100_000_000n, [40n, 30n, 30n])).toEqual([40_000_000n, 30_000_000n, 30_000_000n]);
  // 10 atoms at 1/3 each: 3.33 floors to 3, and the one atom left goes to the
  // first of three equal remainders.
  expect(splitByWeights(10n, [1n, 1n, 1n])).toEqual([4n, 3n, 3n]);
  // 7 atoms at 50/25/25: 3.5, 1.75, 1.75 floor to 3, 1, 1; the two left go to
  // the .75 remainders before the .5.
  expect(splitByWeights(7n, [50n, 25n, 25n])).toEqual([3n, 2n, 2n]);
  const parts = splitByWeights(1_000_000_001n, [13n, 17n, 19n, 23n, 28n]);
  expect(parts.reduce((sum, part) => sum + part, 0n)).toBe(1_000_000_001n);
  expect(splitByWeights(5n, [])).toEqual([]);
  expect(splitByWeights(5n, [0n, 0n])).toEqual([]);
});

test("a split reads as one line however many constituents share it, naming the remainder exactly", () => {
  const legs = (total: bigint, symbols: string[]) => splitEvenly(total, symbols.length).map((atoms, i) => ({ symbol: symbols[i], atoms }));
  const many = Array.from({ length: 23 }, (_, i) => `S${i}`);
  // 1 USDC over 23 is 43,478 atoms each with 6 left over, the case that
  // printed a 23-clause sentence on 7 October 2026.
  expect(describeSplit(legs(1_000_000n, many), 6, "USDC")).toBe("0.043478 USDC to each of 23; the first 6 get 0.000001 USDC more, so the total is exact.");
  expect(describeSplit(legs(9_000_000n, ["AMD", "BE", "MU"]), 6, "USDC")).toBe("3.000000 USDC to each of 3.");
  expect(describeSplit(legs(10_000_001n, ["AMD", "BE", "MU"]), 6, "USDC")).toBe("3.333333 USDC to each of 3; AMD, BE get 0.000001 USDC more, so the total is exact.");
  expect(describeSplit(legs(250_000_000n, ["AMD"]), 6, "USDC")).toBe("All 250.000000 USDC to AMD.");
});

test("the routing fee is capped at 25 basis points and falls as the basket grows", () => {
  // Storm, 7 October 2026: 0.25% for one constituent, 0.15% for two to four, 0.10% for five or more.
  expect([1, 2, 4, 5, 23].map(routingFeeBps)).toEqual([25, 15, 15, 10, 10]);
  expect(feeSchedule()).toBe("0.25% for 1, 0.15% for 2 to 4, 0.10% for 5 or more constituents");
  expect(routingFeeAtoms(125_000_000n, 25)).toBe(312_500n);
  // 399 atoms of USDC carry 0.9975 atoms of fee at 25 bps, which no account can hold.
  expect(routingFeeAtoms(399n, 25)).toBe(0n);
  expect(routingFeeAtoms(400n, 25)).toBe(1n);
});

test("one lot cap converts its policy-issued capacity to exact atoms", () => {
  expect(lotCapAtoms(1000)).toBe(1_000_000_000n);
});

test("one USDC per constituent is the exact minimum shown before a buy", () => {
  expect(minimumPlanAtoms(1)).toBe(1_000_000n);
  expect(minimumPlanAtoms(2)).toBe(2_000_000n);
  expect(minimumPlanAtoms(12)).toBe(12_000_000n);
});

test("fee-bearing quotes request Jupiter V2 instructions for Token-2022 constituents", () => {
  const params = quoteParams("AAPLxMint", 1_000_000n, 15);
  expect(params.get("instructionVersion")).toBe("V2");
  expect(params.get("amount")).toBe("1000000");
  expect(params.get("platformFeeBps")).toBe("15");
});

test("an exit quote spends exact token atoms and receives USDC", () => {
  const params = sellQuoteParams("AMZNxMint", 380117n, 25);
  expect(params.get("inputMint")).toBe("AMZNxMint");
  expect(params.get("outputMint")).toBe(USDC_MINT);
  expect(params.get("amount")).toBe("380117");
  expect(params.get("platformFeeBps")).toBe("25");
});

test("holdings sum every token account for the same listed mint without including unknown mints", () => {
  const lot = admissions.instruments.find((item) => item.instrument.symbol === "AMZNx")!;
  const positions = listedPositions([
    { mint: lot.instrument.mint, atoms: "100", decimals: lot.decimals, tokenProgram: lot.token_program },
    { mint: lot.instrument.mint, atoms: "217", decimals: lot.decimals, tokenProgram: lot.token_program },
    { mint: "UnlistedMint", atoms: "500", decimals: 6, tokenProgram: lot.token_program },
  ], [lot]);
  expect(positions).toEqual([{ mint: lot.instrument.mint, symbol: "AMZNx", atoms: "317", sellableAtoms: "317", scale: lot.decimals, tokenProgram: lot.token_program }]);
});

test("a sale only offers the associated account balance when holdings span token accounts", () => {
  const lot = admissions.instruments.find((item) => item.instrument.symbol === "AMZNx")!;
  const positions = listedPositions([
    { mint: lot.instrument.mint, atoms: "100", decimals: lot.decimals, tokenProgram: lot.token_program, account: "associated" },
    { mint: lot.instrument.mint, atoms: "217", decimals: lot.decimals, tokenProgram: lot.token_program, account: "other" },
  ], [lot], new Map([[lot.instrument.mint, "associated"]]));
  expect(positions[0].atoms).toBe("317");
  expect(positions[0].sellableAtoms).toBe("100");
});

function swapLike(programIds: string[]): VersionedTransaction {
  const payer = Keypair.generate().publicKey;
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: programIds.map((id) => new TransactionInstruction({ programId: new PublicKey(id), keys: [], data: Buffer.alloc(0) })),
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

test("a swap that invokes only listed programs passes the allowlist", () => {
  const transaction = swapLike([
    "ComputeBudget111111111111111111111111111111",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  ]);
  expect(unlistedProgram(transaction)).toBeUndefined();
});

test("a swap that invokes any unlisted program is refused, naming it", () => {
  const stranger = Keypair.generate().publicKey.toBase58();
  const transaction = swapLike(["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", stranger]);
  expect(unlistedProgram(transaction)).toBe(stranger);
});

const secret = "test-secret-not-a-deployment-value";
const terms: ApprovalTerms = {
  direction: "buy",
  wallet: Keypair.generate().publicKey.toBase58(),
  mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
  inputDigest: "abc123",
  policyVersion: "policy-2026.09.2",
  inAtoms: "250000000",
  outAtoms: "74000000",
  floorAtoms: "73630000",
  messageSha256: messageDigest(Buffer.from("the unsigned message")),
  expiresAt: "2026-10-01T12:00:30.000Z",
};
const before = new Date("2026-10-01T12:00:10.000Z");

test("an approval this server signed opens to exactly its terms before expiry", () => {
  expect(openApproval(signApproval(terms, secret), secret, before)).toEqual({ terms });
});

test("changing any bound input invalidates the approval", () => {
  const token = signApproval(terms, secret);
  const [encoded, mac] = token.split(".");
  for (const field of Object.keys(terms) as (keyof ApprovalTerms)[]) {
    const altered = JSON.parse(Buffer.from(encoded, "base64url").toString()) as string[];
    const index = Object.keys(terms).indexOf(field);
    altered[index] = `${altered[index]}x`;
    const forged = `${Buffer.from(JSON.stringify(altered)).toString("base64url")}.${mac}`;
    expect("refused" in openApproval(forged, secret, before), `altering ${field} must refuse`).toBe(true);
  }
});

test("an approval from another secret, or past its expiry, is refused", () => {
  expect("refused" in openApproval(signApproval(terms, "another-secret"), secret, before)).toBe(true);
  expect("refused" in openApproval("not-a-token", secret, before)).toBe(true);
});

test("an approval that arrives late says by how much, and which action fetches a fresh quote", () => {
  expect(openApproval(signApproval(terms, secret), secret, new Date("2026-10-01T12:00:30.000Z"))).toEqual({ terms });
  expect(openApproval(signApproval(terms, secret), secret, new Date("2026-10-01T12:00:30.200Z"))).toEqual({
    refused: "Your approval reached Seametry 1 second after this quote's 30-second signing window closed, so it was not sent. Buy again for a fresh quote, then approve in your wallet without waiting.",
  });
  const sale = { ...terms, direction: "sell" as const };
  expect(openApproval(signApproval(sale, secret), secret, new Date("2026-10-01T12:00:44.000Z"))).toEqual({
    refused: "Your approval reached Seametry 14 seconds after this quote's 30-second signing window closed, so it was not sent. Sell again for a fresh quote, then approve in your wallet without waiting.",
  });
});

test("a leg's loaded data limit is its measurement plus an eighth, in whole 32 KiB pages, within the runtime's ceiling", () => {
  const page = 32 * 1024;
  expect(loadedDataLimit(1)).toBe(page);
  expect(loadedDataLimit(235)).toBe(page);
  // 1,000,000 bytes plus 125,000 is 1,125,000: 35 pages (1,146,880 bytes).
  expect(loadedDataLimit(1_000_000)).toBe(35 * page);
  expect(loadedDataLimit(28 * page)).toBe(32 * page);
  expect(loadedDataLimit(LOADED_DATA_LIMIT_MAX_BYTES)).toBe(LOADED_DATA_LIMIT_MAX_BYTES);
});

test("the country gate fails closed and honours the operator's list", () => {
  expect(countryGate("NG", undefined).open).toBe(false);
  expect(countryGate("NG", "  ").open).toBe(false);
  expect(countryGate(null, "US").open).toBe(false);
  expect(countryGate("us", "US, GB").open).toBe(false);
  expect(countryGate("NG", "US, GB")).toEqual({ open: true, country: "NG" });
});

test("a lot is offered only when its capacity decision admits a measured size", () => {
  const sample = admissions.instruments[0];
  const as = (decision: string, capacity = sample.capacity_usdc) => ({
    ...sample,
    capacity_usdc: capacity,
    capacity_decision: { ...sample.capacity_decision, decision },
  }) as typeof sample;
  expect(isAdmitted(as("ALLOW"))).toBe(true);
  expect(isAdmitted(as("WARN"))).toBe(true);
  expect(isAdmitted(as("BLOCK"))).toBe(false);
  expect(isAdmitted(as("WARN", 0))).toBe(false);
  const { admitted, refused } = partitionAdmissions([as("WARN"), as("BLOCK")]);
  expect([admitted.length, refused.length]).toEqual([1, 1]);
});

test("the allocation catalogue exposes policy-issued capacity per offered lot", () => {
  const offered = admissions.instruments.filter(isAdmitted);
  // The policy engine's output after the 4 October 2026 capture of eighteen
  // more xStocks (shared/evidence/depth-2026-10-04.md) and the 7 October 2026
  // capture of eight Backpack Securities twins (depth-2026-10-07.md), and the
  // 12 October 2026 capture of the basket constituents never assayed before
  // (depth-2026-10-12.md; ARM, IREN and VCXx were refused), in snapshot order.
  expect(offered.map((lot) => [lot.instrument.symbol, lot.capacity_usdc])).toEqual([
    ["AMD", 10000],
    ["BE", 1000],
    ["BLK", 1000],
    ["CRWV", 1000],
    ["COPX", 1000],
    ["EWY", 1000],
    ["EWZ", 1000],
    ["FWDI", 1000],
    ["HOOD", 1000],
    ["MRNA", 10000],
    ["MSTR", 10000],
    ["MU", 10000],
    ["NBIS", 1000],
    ["NFLX", 10000],
    ["PUSA", 1000],
    ["SNDK", 10000],
    ["SPCX", 10000],
    ["AMZNx", 10000],
    ["SPCXx", 10000],
    ["GOOGLx", 10000],
    ["TSLAx", 10000],
    ["NFLXx", 100],
    ["METAx", 10000],
    ["TSMx", 1000],
    ["AAPLx", 10000],
    ["NVDAx", 10000],
    ["AVGOx", 1000],
    ["INTCx", 100],
    ["ORCLx", 100],
    ["TQQQx", 100],
    ["PLTRx", 1000],
    ["MSFTx", 10000],
    ["INTC", 1000],
  ]);
  expect(offered.every((lot) => lot.capacity_decision.input_digest.match(/^[0-9a-f]{64}$/))).toBe(true);
});

test("each stock row names the company once and its issuer once, and opens its own detail", async ({ page }) => {
  await page.goto("/app/allocation");
  const lots = page.getByRole("main").locator('[aria-label="Choose the constituents"] > ul > li');
  const backpack = lots.filter({ has: page.getByText("SPCX", { exact: true }) });
  const xstocks = lots.filter({ has: page.getByText("SPCXx", { exact: true }) });
  // Names come from each mint's own metadata with the issuer's suffix removed.
  await expect(backpack.getByText("SpaceX · Backpack", { exact: true })).toBeVisible();
  await expect(xstocks.getByText("SpaceX · xStocks", { exact: true })).toBeVisible();
  await expect(backpack.getByRole("link", { name: "SPCX assay" })).toHaveAttribute("href", /\/app\/instruments\//);
  await expect(xstocks.getByRole("link", { name: "SPCXx assay" })).toHaveAttribute("href", /\/app\/instruments\//);
  // Every offered row has a name, and none repeats its issuer inside it.
  await expect(lots.getByText("No name in the mint's metadata")).toHaveCount(0);
  await expect(lots.getByText(/Backpack Securities|xStock\b/)).toHaveCount(0);
  await expect(backpack.getByText("Warn", { exact: true })).toHaveCount(0);
});

test("an allocation stock opens its captured assay when the live Gateway has no record", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/terminal/instruments/*", (route) =>
    route.fulfill({ status: 404, json: { title: "Not found", detail: "No live instrument record.", status: 404 } }),
  );
  await page.goto("/app/allocation");
  const stock = page.getByRole("main").getByRole("link", { name: "AMD assay", exact: true });
  await stock.click();
  await expect(page.getByRole("heading", { level: 1, name: "AMD" })).toBeVisible();
  await expect(page.getByText("Captured allocation record", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Not found" })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("search moves the view, filters shape the plan, and both count what they hide", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/allocation");
  const main = page.getByRole("main");
  const constituents = main.getByRole("complementary", { name: "Order sheet" }).locator("dd").nth(1);
  const rows = main.locator('[aria-label="Choose the constituents"] > ul > li');
  const offered = admissions.instruments.filter(isAdmitted);
  const entitled = offered.filter((lot) => lot.instrument.grade === "entitlement").length;
  await expect(main.getByText(`Showing ${offered.length} of ${offered.length}.`, { exact: true })).toBeVisible();
  for (const box of await rows.locator("input[type=checkbox]").all()) await box.check();

  // Search narrows the rows but every chosen lot stays in the plan.
  await main.getByLabel("Search by symbol or issuer").fill("spcx");
  await expect(rows).toHaveCount(2);
  await expect(constituents).toHaveText(String(offered.length));
  await main.getByLabel("Search by symbol or issuer").fill("");

  // A filter is a preference: chosen lots outside it leave the plan, counted.
  await main.getByLabel("Filters").click();
  await page.getByRole("radio", { name: "Entitlement" }).check();
  const hidden = offered.length - entitled;
  await expect(main.getByText(`Showing ${entitled} of ${offered.length}. ${hidden} chosen are outside the filters and left out of the plan.`, { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(entitled);
  await expect(constituents).toHaveText(String(entitled));
  await expect(main.getByLabel("Filters, 1 on")).toBeVisible();

  await expect(main.locator("output")).toHaveText(`${entitled}/${offered.length}`);
  await expect(rows.first().getByText("Warn", { exact: true })).toHaveCount(0);
});

test("a mirrored SVG logo is drawn on its row and served under the script policy", async ({ page, request }) => {
  const path = "/instruments/SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb.svg";
  const served = await request.get(path);
  expect(served.headers()["content-type"]).toContain("image/svg+xml");
  // The mirror refuses script in an SVG; this policy is the second guard,
  // for anyone who opens the file directly rather than through an img.
  expect(served.headers()["content-security-policy"]).toContain("script-src 'self' 'nonce-");
  await page.goto("/app/allocation");
  const row = page.getByRole("main").locator('[aria-label="Choose the constituents"] > ul > li').filter({ has: page.getByText("SPCX", { exact: true }) });
  await expect(row.locator(`img[src="${path}"]`)).toBeVisible();
});

test("the committed snapshot is the policy engine's, for every captured lot", () => {
  expect(admissions.producer).toContain("server/cmd/explorer -admissions");
  expect(admissions.instruments.length).toBeGreaterThan(0);
  for (const admission of admissions.instruments) {
    expect(admission.decision.policy_version).toBe(admissions.policy_version);
    expect(admission.decision.input_digest).toMatch(/^[0-9a-f]{64}$/);
  }
});

test("the dashboard wallet disclosure opens below its header containment", async ({ page }) => {
  await page.goto("/app/allocation");
  const trigger = page.getByText("Connect", { exact: true });
  await trigger.click();
  const panel = page.getByText("No signing wallet is available in this browser.", { exact: false });
  await expect(panel).toBeVisible();
  const triggerBox = await trigger.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(panelBox?.y).toBeGreaterThan(triggerBox?.y ?? 0);
});

test("a page loaded with a wallet installed hydrates without React redrawing it", async ({ page }) => {
  // The server lists no wallets; a browser with one installed used to list
  // it on its first render, a mismatch React reports as error number 418.
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await registerTestWallet(page, { trusted: false });
  await page.goto("/app/alloys");
  await expect(page.getByRole("heading", { level: 1, name: "Alloys" })).toBeVisible();
  await page.getByText("Connect", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect Test wallet" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a wallet that already trusts the site shows as connected the moment it is chosen", async ({ page }) => {
  await registerTestWallet(page, { trusted: true });
  await page.goto("/app/allocation");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(page.getByLabel(/Wallet 4vJ9/)).toBeVisible();
  await expect(page.getByTestId("wallet-account")).toBeVisible();
});

test("one Allocation decision preflights the whole plan and never signs a refused simulation", async ({ page }) => {
  await registerTestWallet(page, { trusted: true, signs: true });
  const aapl = admissions.instruments.find((lot) => lot.instrument.symbol === "AAPLx");
  expect(aapl).toBeDefined();
  await page.goto(`/app/allocation?selected=${aapl!.instrument.mint}&amount=1`);
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(page.getByLabel(/Wallet 4vJ9/)).toBeVisible();
  let prepares = 0;
  await page.route("**/api/allocation/prepare-batch", (route) => {
    prepares += 1;
    return route.fulfill({ status: 422, json: { error: "The route could not be simulated." } });
  });
  const submits = await acceptSubmits(page);
  await page.getByRole("button", { name: "Buy allocation" }).click();
  const stopped = page.getByRole("dialog", { name: "Purchase stopped" });
  await expect(stopped).toContainText("The route could not be simulated. Nothing was signed or spent.");
  expect(prepares).toBe(1);
  expect(submits()).toBe(0);
  await stopped.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByRole("button", { name: "Buy allocation" })).toBeEnabled();
});

test("a leg Seametry refuses to send is recorded as not sent, and nothing moved", async ({ page }) => {
  await registerTestWallet(page, { trusted: true, signs: true });
  const aapl = admissions.instruments.find((lot) => lot.instrument.symbol === "AAPLx")!;
  const nvda = admissions.instruments.find((lot) => lot.instrument.symbol === "NVDAx")!;
  await page.goto(`/app/allocation?selected=${aapl.instrument.mint},${nvda.instrument.mint}&amount=2`);
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.route("**/api/allocation/prepare-batch", (route) => route.fulfill({ json: [preparedLeg(), preparedLeg()] }));
  await page.route("**/api/allocation/submit", (route) => route.fulfill({
    status: 409,
    json: { code: "SIGNED_MESSAGE_CHANGED", sent: false, error: "The transaction was changed after it was approved, so it was not sent. Prepare the leg again." },
  }));
  const asked = await answerChain(page, () => ({ phase: "sent" }));
  await page.getByRole("button", { name: "Buy allocation" }).click();

  const toasts = page.getByRole("region", { name: "Requests in progress" });
  await expect(toasts).toContainText("Nothing bought: Custom allocation");
  // Both legs share one reason, so the toast says it rather than pointing elsewhere.
  await expect(toasts).toContainText("Nothing changed hands. The transaction was changed after it was approved");
  // A refused leg is final, so the chain is never asked about it.
  expect(asked).toHaveLength(0);
  await toasts.getByRole("button", { name: /show in Activity/ }).click();
  const activity = page.getByRole("dialog", { name: "Activity" });
  await expect(activity.getByText("Not sent", { exact: true })).toHaveCount(2);
  // Once on each leg; the record's outcome sentence states it once more for both.
  await expect(activity.getByRole("listitem").getByText("The transaction was changed after it was approved", { exact: false })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Buy allocation" })).toBeEnabled();
});

test("a confirmed purchase lands in Activity with what it received and its signature", async ({ page }) => {
  await registerTestWallet(page, { trusted: true, signs: true });
  const aapl = admissions.instruments.find((lot) => lot.instrument.symbol === "AAPLx")!;
  await page.goto(`/app/allocation?selected=${aapl.instrument.mint}&amount=1`);
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.route("**/api/allocation/prepare-batch", (route) => route.fulfill({ json: [preparedLeg({ lastValidBlockHeight: 4_321 })] }));
  await acceptSubmits(page);
  const asked = await answerChain(page, () => ({ phase: "landed", changes: [{ mint: aapl.instrument.mint, atoms: "3700", scale: aapl.decimals }, { mint: USDC_MINT, atoms: "-1000000", scale: 6 }] }));
  await page.getByRole("button", { name: "Buy allocation" }).click();

  const toasts = page.getByRole("region", { name: "Requests in progress" });
  await expect(toasts).toContainText("Bought Custom allocation", { timeout: 10_000 });
  // The dialog handed over on approval; the toast carries the purchase.
  await expect(page.getByRole("dialog", { name: "Buying Custom allocation" })).toHaveCount(0);
  await expect(toasts.getByRole("link", { name: "View holdings" })).toHaveAttribute("href", "/app/positions");
  // The watcher asks with the leg's own block height deadline.
  expect(asked[0].lastValidBlockHeight).toBe(4_321);
  await page.getByTestId("activity-trigger").click();
  const activity = page.getByRole("dialog", { name: "Activity" });
  await expect(activity).toContainText(`1.000000 USDC for ${formatAmount("3700", aapl.decimals)} AAPLx`);
  await expect(activity.getByRole("link", { name: "Read AAPLx signature on Solscan" })).toHaveAttribute("href", /^https:\/\/solscan\.io\/tx\/[1-9A-HJ-NP-Za-km-z]{64,88}$/);
});

test("a published basket buys every constituent from its record with one Key press and one batch", async ({ page }) => {
  await registerTestWallet(page, { trusted: true, signs: true });
  const basket = findAllocationIndex("prime-seven")!;
  const mints = basket.members.map((member) => admissions.instruments.find((lot) => lot.instrument.symbol === member.symbol)!.instrument.mint);
  const batches: { legs: { mint: string; usdcAtoms: string }[]; planMints: string[] }[] = [];
  await page.route("**/api/allocation/prepare-batch", async (route) => {
    batches.push(route.request().postDataJSON());
    await route.fulfill({ json: mints.map(() => preparedLeg({ landing: "sender", tipLamports: "5000" })) });
  });
  const submits = await acceptSubmits(page);
  await answerChain(page, () => ({ phase: "landed", changes: [] }));

  await page.goto("/app/baskets/prime-seven?amount=7");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  const order = page.getByRole("region", { name: "Buy Prime Seven" });
  // The amount came from the URL a wallet's in-app browser would open.
  await expect(order.getByLabel("USDC to spend")).toHaveValue("7");
  await order.getByRole("button", { name: "Buy basket" }).click();

  const toasts = page.getByRole("region", { name: "Requests in progress" });
  await expect(toasts).toContainText("Bought Prime Seven", { timeout: 10_000 });
  await expect(toasts).toContainText("All 7 purchases landed.");
  expect(batches).toHaveLength(1);
  expect(batches[0].legs.map((leg) => leg.mint).sort()).toEqual([...mints].sort());
  expect(batches[0].legs.every((leg) => leg.usdcAtoms === "1000000")).toBe(true);
  expect(submits()).toBe(7);
  // The Key is free the moment the wallet approves; nothing waits on it.
  await expect(order.getByRole("button", { name: "Buy basket" })).toBeEnabled();
});

test("an allocation shows its two waits before the wallet, then hands over", async ({ page }) => {
  await registerTestWallet(page, { trusted: true, signs: true });
  const aapl = admissions.instruments.find((lot) => lot.instrument.symbol === "AAPLx")!;
  let releasePreflight!: () => void;
  const preflightHeld = new Promise<void>((resolve) => { releasePreflight = resolve; });
  await page.route("**/api/allocation/prepare-batch", async (route) => {
    await preflightHeld;
    await route.fulfill({ status: 422, json: { error: "The route changed before it could be simulated." } });
  });

  await page.goto(`/app/allocation?selected=${aapl.instrument.mint}&amount=1`);
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("button", { name: "Buy allocation" }).click();

  const dialog = page.getByRole("dialog", { name: "Buying Custom allocation" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("step-register")).toContainText("Check every route");
  await expect(dialog.getByTestId("step-register")).toContainText("Approve in your wallet");
  releasePreflight();
  await expect(page.getByRole("dialog", { name: "Purchase stopped" })).toContainText("Nothing was signed or spent");
});

for (const landing of ["rpc", "sender"] as const) {
  test(`legs landing through ${landing === "rpc" ? "the RPC are sent a second apart" : "Sender are sent together"}`, async ({ page }) => {
    await registerTestWallet(page, { trusted: true, signs: true });
    const symbols = ["AAPLx", "NVDAx", "AMZNx"];
    const mints = symbols.map((symbol) => admissions.instruments.find((entry) => entry.instrument.symbol === symbol)!.instrument.mint);
    await page.route("**/api/allocation/prepare-batch", (route) => route.fulfill({ json: mints.map(() => preparedLeg({ landing, tipLamports: landing === "sender" ? "5000" : "0" })) }));
    const arrivals: number[] = [];
    await page.route("**/api/allocation/submit", (route) => {
      arrivals.push(Date.now());
      return route.fulfill({ json: { signature: "answered" } });
    });
    await answerChain(page, () => ({ phase: "sent" }));
    await page.goto(`/app/allocation?selected=${mints.join(",")}&amount=3`);
    await page.getByText("Connect", { exact: true }).click();
    await page.getByRole("button", { name: "Connect Test wallet" }).click();
    await page.getByRole("button", { name: "Buy allocation" }).click();
    await expect.poll(() => arrivals.length, { timeout: 10_000 }).toBe(3);
    const gaps = arrivals.slice(1).map((at, index) => at - arrivals[index]);
    if (landing === "rpc") expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1_000);
    else expect(Math.max(...gaps)).toBeLessThan(500);
  });
}

test("Sender's tip accounts are ten distinct mainnet addresses", () => {
  expect(SENDER_TIP_ACCOUNTS).toHaveLength(10);
  expect(new Set(SENDER_TIP_ACCOUNTS).size).toBe(10);
  for (const account of SENDER_TIP_ACCOUNTS) expect(() => new PublicKey(account)).not.toThrow();
});

test("a Sender leg is the holder's transaction with the holder's tip last, signed by the holder alone", () => {
  const holder = Keypair.generate();
  const wallet = holder.publicKey;
  const tipAccount = senderTipAccount(3);
  const jupiterIx = (programId: string, bytes: number) => ({ programId, accounts: [{ pubkey: wallet.toBase58(), isSigner: true, isWritable: true }], data: Buffer.alloc(bytes, 1).toString("base64") });
  const parts = {
    computeBudgetInstructions: [jupiterIx("ComputeBudget111111111111111111111111111111", 9)],
    setupInstructions: [],
    swapInstruction: jupiterIx("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", 40),
    addressLookupTableAddresses: [],
  };
  const blockhash = Keypair.generate().publicKey.toBase58();
  const leg = composeSwap({ wallet, tipAccount, parts, lookupTables: [], blockhash })!;
  expect(leg).toBeDefined();
  // The holder pays the network fee, the tip, and is the only signer.
  expect(leg.message.staticAccountKeys[0].equals(wallet)).toBe(true);
  expect(leg.message.header.numRequiredSignatures).toBe(1);
  const keys = leg.message.staticAccountKeys;
  const last = leg.message.compiledInstructions.at(-1)!;
  expect(keys[last.programIdIndex].equals(SystemProgram.programId)).toBe(true);
  expect(keys[last.accountKeyIndexes[0]].equals(wallet)).toBe(true);
  expect(keys[last.accountKeyIndexes[1]].equals(tipAccount)).toBe(true);
  // SystemProgram transfer: a 4-byte instruction index, then the lamports as a little-endian u64.
  expect(Buffer.from(last.data).readBigUInt64LE(4)).toBe(BigInt(SENDER_TIP_LAMPORTS));
  expect(unlistedProgram(leg)).toBeUndefined();
  expect(carriesSenderTip(leg)).toBe(true);
  leg.sign([holder]);
  expect(leg.signatures[0].some((byte) => byte !== 0)).toBe(true);

  // A route too big to carry the tip is not offered at all.
  const oversized = { ...parts, swapInstruction: jupiterIx("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", TRANSACTION_SIZE_LIMIT) };
  expect(composeSwap({ wallet, tipAccount, parts: oversized, lookupTables: [], blockhash })).toBeUndefined();
});

test("the routing fee is lowered, rounding up, by the tip's worth and never below zero", () => {
  // A tip worth 750 USDC atoms on a 1 USDC leg is 7.5 basis points: 8 come off.
  expect(tipOffsetBps(750n, 1_000_000n, 25)).toBe(8);
  // On 100 USDC it is under one basis point, and still one comes off.
  expect(tipOffsetBps(750n, 100_000_000n, 25)).toBe(1);
  // Worth more than the fee: the fee is gone, never negative.
  expect(tipOffsetBps(2_000n, 1_000_000n, 10)).toBe(10);
  expect(tipOffsetBps(750n, 0n, 15)).toBe(15);
  // A tip that divides exactly is not rounded past itself.
  expect(tipOffsetBps(500n, 1_000_000n, 25)).toBe(5);
});

test("a preflight refusal is classified by what refused it", () => {
  // The shape web3.js gives a preflight refusal: Jupiter's slippage error,
  // 6001 (0x1771), raised by the aggregator itself.
  const slippage = [
    "Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 invoke [1]",
    "Program log: Error: SlippageToleranceExceeded",
    "Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1771",
  ];
  expect(preflightRefusal("Simulation failed. Message: Transaction simulation failed: Error processing Instruction 3: custom program error: 0x1771.", slippage)).toEqual({ kind: "slippage" });
  const goonfi = [
    "Program goonuddtQRrWqqn5nFyczVKaie28f3kDkHWkHtURSLE failed: custom program error: 0x15",
    "Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x15",
  ];
  expect(preflightRefusal("Simulation failed.", goonfi)).toEqual({ kind: "venue", program: "goonuddtQRrWqqn5nFyczVKaie28f3kDkHWkHtURSLE" });
  expect(preflightRefusal("Simulation failed. Message: Transaction simulation failed: Blockhash not found.", [])).toEqual({ kind: "expired" });
  expect(preflightRefusal("Simulation failed. Message: Attempt to debit an account but found no record of a prior credit.", ["Transfer: insufficient lamports 10, need 5000"])).toEqual({ kind: "unfunded" });
  expect(preflightRefusal("Simulation failed.", [])).toEqual({ kind: "other" });
});

test("a simulation failure inside a venue names that venue, and one inside Jupiter names none", () => {
  // The two failure lines of a live NBIS, NVDAx and AVGOx preflight, 13 October 2026.
  const goonfi = [
    "Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 invoke [1]",
    "Program goonuddtQRrWqqn5nFyczVKaie28f3kDkHWkHtURSLE invoke [2]",
    "Program goonuddtQRrWqqn5nFyczVKaie28f3kDkHWkHtURSLE failed: custom program error: 0x15",
    "Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x15",
  ];
  expect(failedVenueProgram(goonfi)).toBe("goonuddtQRrWqqn5nFyczVKaie28f3kDkHWkHtURSLE");
  // Slippage or a token program refusing is not a venue's moment, so nothing is routed around.
  expect(failedVenueProgram([
    "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb failed: custom program error: 0x1",
    "Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1771",
  ])).toBeUndefined();
  expect(failedVenueProgram([])).toBeUndefined();
});

test("a wallet short of funds is asked to fund or adjust, and no purchase is marked failed", async ({ page }) => {
  await registerTestWallet(page, { trusted: true });
  let submits = 0;
  await page.route("**/api/allocation/prepare-batch", (route) =>
    route.fulfill({ status: 402, json: { error: "This wallet holds 3.000000 USDC; the Allocation requires 7.000000 USDC." } }));
  await page.route("**/api/allocation/submit", (route) => { submits += 1; return route.fulfill({ status: 500, json: { error: "must not be called" } }); });

  await page.goto("/app/baskets/prime-seven?amount=7");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  const order = page.getByRole("region", { name: "Buy Prime Seven" });
  await order.getByRole("button", { name: "Buy basket" }).click();

  const dialog = page.getByRole("dialog", { name: "Fund the wallet or lower the amount" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("This wallet holds 3.000000 USDC; the Allocation requires 7.000000 USDC.");
  await expect(dialog.getByRole("button", { name: "Copy wallet address" })).toBeVisible();
  // The address is shortened in the middle and copied whole, so it never overflows the dialog.
  await expect(dialog.getByText("4vJ9JU…MAnX1d", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByText("Allocation preflight stopped before signing")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Adjust amount" }).click();
  await expect(dialog).toHaveCount(0);
  const amount = order.getByLabel("USDC to spend");
  await expect(amount).toBeEditable();
  await expect(amount).toBeFocused();
  expect(submits).toBe(0);
});

test("a purchase whose status cannot be read says so within a minute, and never reads as stuck", async ({ page }) => {
  await page.clock.install();
  await registerTestWallet(page, { trusted: true, signs: true });
  const aapl = admissions.instruments.find((lot) => lot.instrument.symbol === "AAPLx")!;
  await page.route("**/api/allocation/prepare-batch", (route) => route.fulfill({ json: [preparedLeg()] }));
  await acceptSubmits(page);
  const asked = await answerChain(page, () => ({ status: 502 }));

  await page.goto(`/app/allocation?selected=${aapl.instrument.mint}&amount=1`);
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("button", { name: "Buy allocation" }).click();
  const toasts = page.getByRole("region", { name: "Requests in progress" });
  await expect(toasts).toContainText("Buying Custom allocation");
  for (let tick = 0; tick < 70; tick += 1) {
    await page.clock.runFor(1_000);
    await page.waitForTimeout(10);
  }
  await expect(toasts).toContainText("Mainnet cannot be read right now");
  await expect(toasts.getByRole("link", { name: "Read on Solscan" })).toHaveAttribute("href", /solscan\.io\/tx\//);
  // Failed reads back off to one every 16 seconds, not one a tick.
  expect(asked.length).toBeLessThan(10);
});

test("a purchase the network dropped says nothing moved and offers to buy exactly that again", async ({ page }) => {
  await registerTestWallet(page, { trusted: true, signs: true });
  const basket = findAllocationIndex("prime-seven")!;
  const mints = basket.members.map((member) => admissions.instruments.find((lot) => lot.instrument.symbol === member.symbol)!.instrument.mint);
  await page.route("**/api/allocation/prepare-batch", (route) => route.fulfill({ json: mints.map(() => preparedLeg()) }));
  await acceptSubmits(page);
  await answerChain(page, () => ({ phase: "dropped" }));

  await page.goto("/app/baskets/prime-seven?amount=7");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  const order = page.getByRole("region", { name: "Buy Prime Seven" });
  await order.getByRole("button", { name: "Buy basket" }).click();
  const toasts = page.getByRole("region", { name: "Requests in progress" });
  await expect(toasts).toContainText("Nothing bought: Prime Seven", { timeout: 15_000 });
  const href = new URL(await toasts.getByRole("link", { name: "Buy again" }).getAttribute("href") ?? "", "http://localhost");
  expect(href.pathname).toBe("/app/baskets/build");
  expect(href.searchParams.get("selected")?.split(",").sort()).toEqual([...mints].sort());
  expect(href.searchParams.get("amount")).toBe("7.000000");
  expect(href.searchParams.get("weights")).toBeNull();
  await expect(order.getByRole("button", { name: "Buy basket" })).toBeEnabled();
});

test("a remix buys at the weights the reader set, exactly, and is recorded as a remix", async ({ page }) => {
  await registerTestWallet(page, { trusted: true, signs: true });
  const basket = findAllocationIndex("prime-seven")!;
  const mintOf = (symbol: string) => admissions.instruments.find((lot) => lot.instrument.symbol === symbol)!.instrument.mint;
  const batches: { legs: { mint: string; usdcAtoms: string }[] }[] = [];
  await page.route("**/api/allocation/prepare-batch", async (route) => {
    batches.push(route.request().postDataJSON());
    await route.fulfill({ json: basket.members.map(() => preparedLeg({ landing: "sender", tipLamports: "5000" })) });
  });
  const submits = await acceptSubmits(page);
  await answerChain(page, () => ({ phase: "landed", changes: [] }));

  await page.goto("/app/baskets/build?basket=prime-seven");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("button", { name: "Set amount" }).click();
  await page.getByLabel("USDC to spend").fill("100");
  await page.getByRole("radio", { name: "Custom weights" }).check();
  // The custom form opens on the equal split in whole percents.
  await expect(page.getByText("100% of 100% assigned")).toBeVisible();
  await page.getByLabel("AAPLx", { exact: true }).fill("40");
  await expect(page.getByText(/The weights add to \d+%\. They must add to 100%\./)).toBeVisible();
  // Blocked, not hidden: pressed, it says why.
  await expect(page.getByRole("button", { name: "Buy allocation" })).toHaveAttribute("aria-disabled", "true");
  for (const member of basket.members.filter((member) => member.symbol !== "AAPLx")) {
    await page.getByLabel(member.symbol, { exact: true }).fill("10");
  }
  await expect(page.getByText("7 purchases by weight, from 10.000000 to 40.000000 USDC.", { exact: false })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("weights")).toBeTruthy();

  await page.getByRole("button", { name: "Buy allocation" }).click();
  await expect(page.getByRole("region", { name: "Requests in progress" })).toContainText("Bought Prime Seven remix", { timeout: 10_000 });
  expect(batches).toHaveLength(1);
  expect(submits()).toBe(7);
  const atomsBySymbol = Object.fromEntries(basket.members.map((member) => [member.symbol, batches[0].legs.find((leg) => leg.mint === mintOf(member.symbol))?.usdcAtoms]));
  expect(atomsBySymbol).toEqual({ AAPLx: "40000000", MSFTx: "10000000", AMZNx: "10000000", GOOGLx: "10000000", METAx: "10000000", NVDAx: "10000000", TSLAx: "10000000" });
  const recorded = await page.evaluate(() => JSON.parse(localStorage.getItem("seametry:executions:v1") ?? "[]") as { allocation?: { name: string; templateId?: string }; legs: unknown[] }[]);
  expect(recorded).toHaveLength(1);
  expect(recorded[0].legs).toHaveLength(7);
  expect(recorded[0].allocation).toMatchObject({ name: "Prime Seven remix" });
  expect(recorded[0].allocation?.templateId).toBeUndefined();
});

test("the amount step names and enforces the funding floor before wallet signing", async ({ page }) => {
  const aapl = admissions.instruments.find((lot) => lot.instrument.symbol === "AAPLx");
  await page.goto(`/app/allocation?selected=${aapl!.instrument.mint}&amount=0.5`);
  await expect(page.getByRole("region", { name: "Set the allocation amount" }).getByText("Spend at least 1.000000 USDC for 1 constituent. The minimum is 1 USDC each.")).toBeVisible();
  await expect(page.getByRole("main").getByText("0.01 SOL", { exact: false })).toHaveCount(0);
  await page.getByLabel("USDC to spend").fill("1");
  await expect(page.getByText("Spend at least 1.000000 USDC for 1 constituent. The minimum is 1 USDC each.")).toHaveCount(0);
  await expect(page.getByText("AAPLx, 1.000000 USDC")).toBeVisible();
});

test("a detected Wallet Standard wallet connects from the dashboard header", async ({ page }) => {
  await registerTestWallet(page, { trusted: false });
  await page.goto("/app/allocation");
  await page.getByText("Connect", { exact: true }).click();
  const wallet = page.getByRole("button", { name: "Connect Test wallet" });
  await expect(wallet.locator("img")).toHaveCount(1);
  await wallet.click();
  await expect(page.getByLabel(/Wallet 4vJ9/)).toBeVisible();
  const account = page.getByRole("banner").locator("summary[data-connected]");
  await expect(account.locator(":scope > span").last().locator("img")).toHaveCount(1);
  const ground = await account.evaluate((summary) => {
    const probe = document.createElement("span");
    probe.style.background = "var(--sm-accent-touch)";
    document.body.append(probe);
    const touch = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { actual: getComputedStyle(summary).backgroundColor, touch };
  });
  expect(ground.actual).not.toBe(ground.touch);

  // Whether this machine can reach a mainnet RPC depends on .env.local, so both
  // panel states are driven by recorded responses rather than by the network.
  const panel = page.getByTestId("wallet-account");
  await expect(panel.getByText("Test wallet", { exact: true })).toBeVisible();
  await expect(panel.getByText("Mainnet", { exact: true })).toBeVisible();

  let reply: object = { status: 503, json: { error: "This deployment cannot read mainnet balances: MAINNET_RPC_URL is not set." } };
  await page.route("**/api/wallet/balances?**", (route) => route.fulfill(reply));
  await account.click();
  await account.click();
  await expect(panel.getByRole("status")).toHaveText("Balances unavailable. This deployment cannot read mainnet balances: MAINNET_RPC_URL is not set.");

  reply = {
    json: {
      network: "mainnet",
      source: "Solana mainnet RPC",
      observedAt: new Date().toISOString(),
      holdings: [
        { asset: "SOL", atoms: "1500000000", scale: 9 },
        { asset: "USDC", atoms: "250000000", scale: 6 },
      ],
    },
  };
  await account.click();
  await account.click();
  await expect(panel.locator("dl > div")).toHaveText(["SOL1.500000000", "USDC250.000000"]);
  await expect(panel.getByText(/^Solana mainnet RPC, observed \d+s ago$/)).toBeVisible();
});

test("the balance route names what it expected when a request is malformed", async ({ request }) => {
  const owner = await request.get("/api/wallet/balances?owner=not-an-address&network=mainnet");
  expect(owner.status()).toBe(400);
  expect(await owner.json()).toEqual({ error: "Expected ?owner= a base58 wallet address." });
  const network = await request.get("/api/wallet/balances?owner=4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d&network=testnet");
  expect(network.status()).toBe(400);
  expect(await network.json()).toEqual({ error: "Expected ?network= mainnet or devnet, received testnet." });
});

test("field placeholders are quieter than entered values in both modes", async ({ page }) => {
  await page.goto("/app/allocation");
  const main = page.getByRole("main");
  await main.locator('[aria-label="Choose the constituents"] > ul > li input[type=checkbox]').first().check();
  await main.getByRole("button", { name: "Set amount" }).click();
  const input = page.getByLabel("USDC to spend");
  const read = () =>
    input.evaluate((node) => ({
      value: getComputedStyle(node).color,
      placeholder: getComputedStyle(node, "::placeholder").color,
    }));
  // Read once styled: in CI on 7 October 2026 both colours came back empty
  // while the page, now carrying 23 lots, was still being replaced by
  // hydration, and two empty strings compared equal.
  await expect.poll(async () => (await read()).value).not.toBe("");
  const colours = await read();
  expect(colours.placeholder).not.toBe("");
  expect(colours.placeholder).not.toBe(colours.value);
});

test("the offer the mobile app reads lists the lots the page offers, with their terms and logos", async ({ request }) => {
  const response = await request.get("/api/allocation/offer");
  expect(response.headers()["access-control-allow-origin"]).toBe("*");
  const offer = await response.json();
  const admitted = admissions.instruments.filter(isAdmitted);
  expect(offer.offered.map((lot: { symbol: string }) => lot.symbol)).toEqual(admitted.map((lot) => lot.instrument.symbol));
  expect(offer.refused).toHaveLength(admissions.instruments.length - admitted.length);
  expect(offer.feeSchedule).toBe("0.25% for 1, 0.15% for 2 to 4, 0.10% for 5 or more constituents");
  expect(offer.policyVersion).toBe(admissions.policy_version);
  const apple = offer.offered.find((lot: { symbol: string }) => lot.symbol === "AAPLx");
  expect(apple.logo).toBe("/instruments/XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp.png");
});
