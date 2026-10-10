import { expect, test } from "@playwright/test";
import { Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { describeSplit, formatAmount, formatBalance, parseAmount, splitEvenly } from "../src/lib/amount";
import { admissions, isAdmitted, partitionAdmissions } from "../src/lib/allocation/admissions";
import { messageDigest, openApproval, signApproval, type ApprovalTerms } from "../src/lib/allocation/approval";
import { countryGate, feeSchedule, lotCapAtoms, minimumPlanAtoms, quoteParams, routingFeeAtoms, routingFeeBps, unlistedProgram } from "../src/lib/allocation/rules";
import { registerTestWallet } from "./test-wallet";

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
  expect(openApproval(signApproval(terms, secret), secret, new Date("2026-10-01T12:00:31.000Z"))).toEqual({
    refused: "This quote expired. Refresh to see current terms.",
  });
  expect("refused" in openApproval("not-a-token", secret, before)).toBe(true);
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
  // capture of eight Backpack Securities twins (depth-2026-10-07.md), in
  // snapshot order.
  expect(offered.map((lot) => [lot.instrument.symbol, lot.capacity_usdc])).toEqual([
    ["AMD", 10000],
    ["BE", 1000],
    ["MRNA", 10000],
    ["MU", 10000],
    ["NFLX", 10000],
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

test("each stock row names its issuer and opens its own detail", async ({ page }) => {
  await page.goto("/app/allocation");
  const lots = page.getByRole("main").locator('[aria-label="Choose the constituents"] > ul > li');
  const backpack = lots.filter({ has: page.getByText("SPCX", { exact: true }) });
  const xstocks = lots.filter({ has: page.getByText("SPCXx", { exact: true }) });
  await expect(backpack.getByText("Backpack Securities", { exact: true })).toBeVisible();
  await expect(backpack.getByRole("link", { name: "Open SPCX assay" })).toHaveAttribute("href", /\/app\/instruments\//);
  await expect(xstocks.getByText("Backed Finance (xStocks)", { exact: true })).toBeVisible();
  await expect(xstocks.getByRole("link", { name: "Open SPCXx assay" })).toHaveAttribute("href", /\/app\/instruments\//);
  await expect(backpack.getByText("Warn", { exact: true })).toHaveCount(0);
});

test("an allocation stock opens its captured assay when the live Gateway has no record", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/terminal/instruments/*", (route) =>
    route.fulfill({ status: 404, json: { title: "Not found", detail: "No live instrument record.", status: 404 } }),
  );
  await page.goto("/app/allocation");
  const stock = page.getByRole("main").getByRole("link", { name: "Open AMD assay" });
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

test("one Buy tap prepares the next leg and never asks a wallet to sign a refused simulation", async ({ page }) => {
  await registerTestWallet(page, { trusted: true });
  const aapl = admissions.instruments.find((lot) => lot.instrument.symbol === "AAPLx");
  expect(aapl).toBeDefined();
  await page.goto(`/app/allocation?selected=${aapl!.instrument.mint}&amount=1`);
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(page.getByLabel(/Wallet 4vJ9/)).toBeVisible();
  let prepares = 0;
  let submits = 0;
  await page.route("**/api/allocation/prepare", (route) => {
    prepares += 1;
    return route.fulfill({ status: 422, json: { error: "The route could not be simulated." } });
  });
  await page.route("**/api/allocation/submit", (route) => {
    submits += 1;
    return route.fulfill({ status: 500, json: { error: "Unexpected submission." } });
  });
  await expect(page.getByRole("button", { name: "Buy AAPLx" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview purchase" })).toHaveCount(0);
  await page.getByRole("button", { name: "Buy AAPLx" }).click();
  await expect(page.getByText("The route could not be simulated.")).toBeVisible();
  expect(prepares).toBe(1);
  expect(submits).toBe(0);
  await expect(page.getByRole("button", { name: "Buy AAPLx" })).toBeEnabled();
});

test("the amount step names and enforces the funding floor before wallet signing", async ({ page }) => {
  const aapl = admissions.instruments.find((lot) => lot.instrument.symbol === "AAPLx");
  await page.goto(`/app/allocation?selected=${aapl!.instrument.mint}&amount=0.5`);
  await expect(page.getByText("Spend at least 1.000000 USDC for 1 constituent. The minimum is 1 USDC each.")).toBeVisible();
  await expect(page.getByRole("main").getByText("0.01 SOL", { exact: false }).first()).toBeVisible();
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
