import { expect, test } from "@playwright/test";
import { Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { formatAmount, parseAmount, splitEvenly } from "../src/lib/amount";
import { admissions, isAdmitted, partitionAdmissions } from "../src/lib/allocation/admissions";
import { messageDigest, openApproval, signApproval, type ApprovalTerms } from "../src/lib/allocation/approval";
import { ROUTING_FEE_BPS, countryGate, lotCapAtoms, routingFeeAtoms, unlistedProgram } from "../src/lib/allocation/rules";
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

test("an even split sums to the total exactly, remainder to the first shares", () => {
  expect(splitEvenly(10n, 3)).toEqual([4n, 3n, 3n]);
  expect(splitEvenly(9n, 3)).toEqual([3n, 3n, 3n]);
  const parts = splitEvenly(1_000_000_001n, 7);
  expect(parts.reduce((sum, part) => sum + part, 0n)).toBe(1_000_000_001n);
  expect(splitEvenly(5n, 0)).toEqual([]);
});

test("the routing fee is 50 basis points of each leg, rounded down to whole USDC atoms", () => {
  expect(ROUTING_FEE_BPS).toBe(50);
  expect(routingFeeAtoms(125_000_000n)).toBe(625_000n);
  // 199 atoms of USDC carry 0.995 atoms of fee, which no account can hold.
  expect(routingFeeAtoms(199n)).toBe(0n);
  expect(routingFeeAtoms(200n)).toBe(1n);
});

test("one lot cap converts its policy-issued capacity to exact atoms", () => {
  expect(lotCapAtoms(1000)).toBe(1_000_000_000n);
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
  // more xStocks (shared/evidence/depth-2026-10-04.md), in snapshot order.
  expect(offered.map((lot) => [lot.instrument.symbol, lot.capacity_usdc])).toEqual([
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
  ]);
  expect(offered.every((lot) => lot.capacity_decision.input_digest.match(/^[0-9a-f]{64}$/))).toBe(true);
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
  const trigger = page.getByText("Log in", { exact: true });
  await trigger.click();
  const panel = page.getByText("No wallet was detected in this browser.", { exact: false });
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
  await page.getByText("Log in", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect Test wallet" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a wallet that already trusts the site shows as connected the moment it is chosen", async ({ page }) => {
  await registerTestWallet(page, { trusted: true });
  await page.goto("/app/allocation");
  await page.getByText("Log in", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(page.getByLabel(/Wallet 4vJ9/)).toBeVisible();
  await expect(page.getByTestId("wallet-account")).toBeVisible();
});

test("a detected Wallet Standard wallet connects from the dashboard header", async ({ page }) => {
  await registerTestWallet(page, { trusted: false });
  await page.goto("/app/allocation");
  await page.getByText("Log in", { exact: true }).click();
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
  const input = page.getByLabel("USDC to spend");
  const colours = await input.evaluate((node) => ({
    value: getComputedStyle(node).color,
    placeholder: getComputedStyle(node, "::placeholder").color,
  }));
  expect(colours.placeholder).not.toBe(colours.value);
});
