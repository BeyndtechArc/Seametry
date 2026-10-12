import { expect, test } from "@playwright/test";
import { Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { admissions } from "../src/lib/allocation/admissions";
import { signedSignature } from "../src/lib/allocation/activity";
import { registerTestWallet } from "./test-wallet";

test("a bought Allocation is sold whole with one review and one approval", async ({ page }) => {
  const wallet = "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d";
  await registerTestWallet(page, { trusted: true, signs: true });
  const lots = ["AAPLx", "NVDAx"].map((symbol) => admissions.instruments.find((entry) => entry.instrument.symbol === symbol)!);
  const fakeSignature = (fill: number) => signedSignature(new Uint8Array(64).fill(fill));

  // A settled two-leg purchase as the buy flow records it in this browser:
  // Sell All only offers Allocations bought here.
  const bought = lots.map((lot, index) => ({
    signature: fakeSignature(200 + index), wallet, mint: lot.instrument.mint, symbol: lot.instrument.symbol!, direction: "buy",
    inputAtoms: "1000000", inputScale: 6, submittedAt: new Date(Date.now() - 60_000).toISOString(),
    allocationId: "demo-allocation", allocationName: "Prime Seven", allocationTemplateId: "prime-seven",
    settled: true, settledAtoms: index === 0 ? "400000" : "250000", settledScale: lot.decimals,
  }));
  await page.addInitScript((trades) => localStorage.setItem("seametry:mainnet-allocation-activity:v1", JSON.stringify(trades)), bought);

  await page.route("**/api/allocation/positions?**", (route) => route.fulfill({ json: {
    wallet, network: "mainnet", source: "Solana mainnet RPC", observedAt: new Date().toISOString(), outsideRegister: 0,
    positions: lots.map((lot) => ({ mint: lot.instrument.mint, symbol: lot.instrument.symbol, atoms: "900000", sellableAtoms: "900000", scale: lot.decimals, tokenProgram: lot.token_program })),
  } }));
  await page.route("**/api/allocation/status?**", (route) => route.fulfill({ json: { state: "confirmed" } }));

  const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: new PublicKey(wallet), recentBlockhash: Keypair.generate().publicKey.toBase58(), instructions: [] }).compileToV0Message());
  const prepares: { mint: string; atoms: string }[] = [];
  await page.route("**/api/allocation/sell/prepare", async (route) => {
    prepares.push(route.request().postDataJSON());
    await route.fulfill({ json: {
      transaction: Buffer.from(transaction.serialize()).toString("base64"), approval: "test-approval",
      expiresAt: new Date(Date.now() + 60_000).toISOString(), floorAtoms: "990000", outAtoms: "1000000", outScale: 6,
      routingFeeBps: 0, routingFeeAtoms: "0", priorityFeeLamports: "0", route: ["Test route"], contextSlot: 1, receivedAt: new Date().toISOString(), simulated: [],
    } });
  });
  // The server answers with the signature of the transaction it was sent,
  // which the page checks against the one the wallet signed.
  const submitted: string[] = [];
  await page.route("**/api/allocation/submit", async (route) => {
    const bytes = Buffer.from((route.request().postDataJSON() as { transaction: string }).transaction, "base64");
    const signature = signedSignature(new Uint8Array(bytes.subarray(1, 65)));
    submitted.push(signature);
    await route.fulfill({ json: { signature } });
  });

  await page.goto("/app/positions");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("button", { name: "Sell allocation" }).click();
  const sheet = page.getByRole("dialog", { name: "Sell Prime Seven" });
  await sheet.getByRole("button", { name: "Review sell all" }).click();
  await sheet.getByRole("button", { name: "Approve sell all" }).click();

  await expect(sheet.getByText("Allocation exited")).toBeVisible({ timeout: 10_000 });
  // Exactly the quantities this Allocation bought, capped by what the wallet holds.
  expect(prepares.sort((a, b) => a.mint.localeCompare(b.mint))).toEqual(
    lots.map((lot, index) => ({ wallet, mint: lot.instrument.mint, atoms: index === 0 ? "400000" : "250000" })).sort((a, b) => a.mint.localeCompare(b.mint)),
  );
  expect(submitted).toHaveLength(2);
  expect(new Set(submitted).size).toBe(2);
  await expect(sheet.getByRole("alert")).toHaveCount(0);
});

test("holdings names the exit route without presenting it as redemption", async ({ page }) => {
  await registerTestWallet(page, { trusted: true });
  const lot = admissions.instruments.find((entry) => entry.instrument.symbol === "AMZNx")!;
  await page.route("**/api/allocation/positions?**", (route) => route.fulfill({ json: {
    wallet: "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d",
    network: "mainnet", source: "Solana mainnet RPC", observedAt: new Date().toISOString(), outsideRegister: 0,
    positions: [{ mint: lot.instrument.mint, symbol: "AMZNx", atoms: "15000000", sellableAtoms: "10000000", scale: lot.decimals, tokenProgram: lot.token_program }],
  } }));
  await page.goto("/app/positions");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(page.getByText("0.15 held; 0.1 available to this route")).toBeVisible();
  await page.getByRole("button", { name: "Sell AMZNx" }).click();
  const sheet = page.getByRole("dialog", { name: "Trade AMZNx" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("tab", { name: "Sell" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.getByText("A market swap into USDC. This is not issuer redemption or an Alloy Melt.")).toBeVisible();
  await sheet.getByRole("tab", { name: "Buy" }).click();
  await expect(sheet.getByRole("link", { name: "Buy AMZNx" })).toHaveAttribute("href", `/app/baskets/build?add=${encodeURIComponent(lot.instrument.mint)}`);
  await sheet.getByRole("tab", { name: "Sell" }).click();
  await sheet.getByRole("button", { name: "Use 50%" }).click();
  await expect(sheet.getByLabel("Amount of AMZNx to sell")).toHaveValue("0.05");
  await page.getByRole("button", { name: "Use available balance" }).click();
  await expect(page.getByLabel("Amount of AMZNx to sell")).toHaveValue("0.1");
  await page.getByLabel("Amount of AMZNx to sell").fill("0.2");
  await expect(page.getByText(/associated token account holds/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review sale" })).toBeDisabled();
});
