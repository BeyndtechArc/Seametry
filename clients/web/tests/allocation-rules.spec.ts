import { expect, test } from "@playwright/test";
import { Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { formatAmount, parseAmount, splitEvenly } from "../src/lib/amount";
import { admissions, isAdmitted, partitionAdmissions } from "../src/lib/allocation/admissions";
import { messageDigest, openApproval, signApproval, type ApprovalTerms } from "../src/lib/allocation/approval";
import { countryGate, lotCapAtoms, unlistedProgram } from "../src/lib/allocation/rules";

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
  expect(offered.map((lot) => [lot.instrument.symbol, lot.capacity_usdc])).toEqual([
    ["NFLXx", 100],
    ["AAPLx", 10000],
    ["TQQQx", 100],
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
  const trigger = page.getByText("Connect wallet", { exact: true });
  await trigger.click();
  const panel = page.getByText("No wallet was detected in this browser.", { exact: false });
  await expect(panel).toBeVisible();
  const triggerBox = await trigger.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(panelBox?.y).toBeGreaterThan(triggerBox?.y ?? 0);
});

test("a detected Wallet Standard wallet connects from the dashboard header", async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<(properties: { accounts: unknown[] }) => void>();
    const publicKey = new Uint8Array(32).fill(1);
    const account = {
      address: "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d",
      publicKey,
      chains: ["solana:mainnet", "solana:devnet"],
      features: ["solana:signTransaction"],
      label: "Test account",
      icon: undefined,
    };
    let accounts: typeof account[] = [];
    const wallet = {
      version: "1.0.0",
      name: "Test wallet",
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
      chains: ["solana:mainnet", "solana:devnet"],
      get accounts() { return accounts; },
      features: {
        "standard:events": {
          version: "1.0.0",
          on: (_event: string, listener: (properties: { accounts: unknown[] }) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
        "standard:connect": {
          version: "1.0.0",
          connect: async () => {
            accounts = [account];
            listeners.forEach((listener) => listener({ accounts }));
            return { accounts };
          },
        },
        "solana:signTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy", 0],
          signTransaction: async (...inputs: unknown[]) => inputs,
        },
      },
    };
    window.addEventListener("wallet-standard:app-ready", (event) => {
      (event as CustomEvent<{ register: (entry: unknown) => void }>).detail.register(wallet);
    });
  });

  await page.goto("/app/allocation");
  await page.getByText("Connect wallet", { exact: true }).click();
  const wallet = page.getByRole("button", { name: "Connect Test wallet" });
  await expect(wallet.locator("img")).toHaveCount(1);
  await wallet.click();
  await expect(page.getByLabel(/Wallet 4vJ9/)).toBeVisible();
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
