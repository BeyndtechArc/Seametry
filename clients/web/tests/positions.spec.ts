import { expect, test } from "@playwright/test";
import bs58 from "bs58";
import { admissions } from "../src/lib/allocation/admissions";
import { USDC_MINT } from "../src/lib/allocation/rules";
import { registerTestWallet } from "./test-wallet";
import { acceptSubmits, answerChain, preparedLeg, TEST_WALLET } from "./execution-fixture";

const wallet = TEST_WALLET;

test("a bought Allocation kept from before the engine is sold whole with one review and one approval", async ({ page }) => {
  await registerTestWallet(page, { trusted: true, signs: true });
  const lots = ["AAPLx", "NVDAx"].map((symbol) => admissions.instruments.find((entry) => entry.instrument.symbol === symbol)!);
  const fakeSignature = (fill: number) => bs58.encode(new Uint8Array(64).fill(fill));

  // A settled two-leg purchase in the trade list this browser kept before
  // the engine: Holdings migrates it once into a record, and Sell All only
  // offers Allocations bought here.
  const bought = lots.map((lot, index) => ({
    signature: fakeSignature(200 + index), wallet, mint: lot.instrument.mint, symbol: lot.instrument.symbol!, direction: "buy",
    inputAtoms: "1000000", inputScale: 6, submittedAt: new Date(Date.now() - 60_000).toISOString(),
    allocationId: "demo-allocation", allocationName: "Prime Seven", allocationTemplateId: "prime-seven",
    settled: true, settledAtoms: index === 0 ? "400000" : "250000", settledScale: lot.decimals,
  }));
  await page.addInitScript((trades) => {
    if (!localStorage.getItem("seametry:executions:v1")) localStorage.setItem("seametry:mainnet-allocation-activity:v1", JSON.stringify(trades));
  }, bought);

  await page.route("**/api/allocation/positions?**", (route) => route.fulfill({ json: {
    wallet, network: "mainnet", source: "Solana mainnet RPC", observedAt: new Date().toISOString(), outsideRegister: 0,
    positions: lots.map((lot) => ({ mint: lot.instrument.mint, symbol: lot.instrument.symbol, atoms: "900000", sellableAtoms: "900000", scale: lot.decimals, tokenProgram: lot.token_program })),
  } }));
  const prepares: { mint: string; atoms: string }[] = [];
  await page.route("**/api/allocation/sell/prepare", async (route) => {
    const body = route.request().postDataJSON() as { mint: string; atoms: string };
    prepares.push(body);
    await route.fulfill({ json: preparedLeg({ inAtoms: body.atoms, inScale: 8, outAtoms: "1000000", floorAtoms: "990000" }) });
  });
  const submits = await acceptSubmits(page);
  await answerChain(page, () => ({ phase: "landed", changes: [{ mint: USDC_MINT, atoms: "995000", scale: 6 }] }));

  await page.goto("/app/positions");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("tab", { name: /^Allocations/ }).click();
  await page.getByRole("button", { name: "Sell Prime Seven" }).click();
  const sheet = page.getByRole("dialog", { name: "Sell Prime Seven" });
  await sheet.getByRole("button", { name: "Review sell all" }).click();
  await sheet.getByRole("button", { name: "Approve sell all" }).click();

  // The sheet closes on approval and the toast follows the sales to the end.
  await expect(sheet).toHaveCount(0);
  const toasts = page.getByRole("region", { name: "Requests in progress" });
  await expect(toasts).toContainText("Sold Prime Seven", { timeout: 10_000 });
  await expect(toasts).toContainText("All 2 sales landed.");
  // Exactly the quantities this Allocation bought, capped by what the wallet holds.
  expect(prepares.sort((a, b) => a.mint.localeCompare(b.mint))).toEqual(
    lots.map((lot, index) => ({ wallet, mint: lot.instrument.mint, atoms: index === 0 ? "400000" : "250000" })).sort((a, b) => a.mint.localeCompare(b.mint)),
  );
  expect(submits()).toBe(2);
  // Sold whole, so the Allocation has nothing left to sell.
  await expect(page.getByRole("button", { name: "Sell Prime Seven" })).toHaveCount(0);
  await page.getByRole("tab", { name: /^Activity/ }).click();
  await expect(page.getByRole("tabpanel", { name: "Activity" })).toContainText("0.995000 USDC");
});

test("a sale steps from amount to review in the sheet, then hands over to the toast on approval", async ({ page }) => {
  await registerTestWallet(page, { trusted: true, signs: true });
  const lot = admissions.instruments.find((entry) => entry.instrument.symbol === "AMZNx")!;
  await page.route("**/api/allocation/positions?**", (route) => route.fulfill({ json: {
    wallet, network: "mainnet", source: "Solana mainnet RPC", observedAt: new Date().toISOString(), outsideRegister: 0,
    positions: [{ mint: lot.instrument.mint, symbol: "AMZNx", atoms: "10000000", sellableAtoms: "10000000", scale: lot.decimals, tokenProgram: lot.token_program }],
  } }));
  await page.route("**/api/allocation/sell/prepare", (route) => route.fulfill({ json: preparedLeg({
    inAtoms: "5000000", inScale: lot.decimals, outAtoms: "1000000", floorAtoms: "990000", routingFeeBps: 25, routingFeeAtoms: "2500", priorityFeeLamports: "215264",
    simulated: [{ atoms: "1000000", scale: 6, unit: "USDC" }],
  }) }));
  await acceptSubmits(page);
  await answerChain(page, () => ({ phase: "landed", changes: [{ mint: USDC_MINT, atoms: "1000000", scale: 6 }] }));

  await page.goto("/app/positions");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("button", { name: "Trade AMZNx" }).click();
  const sheet = page.getByRole("dialog", { name: "Trade AMZNx" });
  await expect(sheet.getByRole("list", { name: "Sale steps" })).toContainText("Amount");
  await sheet.getByRole("button", { name: "Use 50%" }).click();
  // The quote waits for the review step; the amount step holds only the amount.
  await expect(sheet.getByText("You receive no less than", { exact: false })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Review sale" }).click();
  await expect(sheet.getByLabel("Amount of AMZNx to sell")).toHaveCount(0);
  await expect(sheet.getByText("Simulated on mainnet for this wallet: +1.000000 USDC.")).toBeVisible();
  await sheet.getByRole("button", { name: "Sign sale" }).click();

  await expect(sheet).toHaveCount(0);
  const toasts = page.getByRole("region", { name: "Requests in progress" });
  await expect(toasts).toContainText("Sold AMZNx", { timeout: 10_000 });
  await expect(toasts.getByRole("link", { name: "View holdings" })).toBeVisible();
  await toasts.getByRole("button", { name: "Dismiss Sold AMZNx" }).click();
  // Its only toast gone, the corner empties and leaves the page.
  await expect(toasts).toHaveCount(0);
});

test("a sale the network dropped says nothing moved and offers to sell again", async ({ page }) => {
  await registerTestWallet(page, { trusted: true, signs: true });
  const lot = admissions.instruments.find((entry) => entry.instrument.symbol === "AMZNx")!;
  await page.route("**/api/allocation/positions?**", (route) => route.fulfill({ json: {
    wallet, network: "mainnet", source: "Solana mainnet RPC", observedAt: new Date().toISOString(), outsideRegister: 0,
    positions: [{ mint: lot.instrument.mint, symbol: "AMZNx", atoms: "10000000", sellableAtoms: "10000000", scale: lot.decimals, tokenProgram: lot.token_program }],
  } }));
  await page.route("**/api/allocation/sell/prepare", (route) => route.fulfill({ json: preparedLeg({ inAtoms: "5000000", inScale: lot.decimals }) }));
  await acceptSubmits(page);
  await answerChain(page, () => ({ phase: "dropped" }));

  await page.goto("/app/positions");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("button", { name: "Trade AMZNx" }).click();
  const sheet = page.getByRole("dialog", { name: "Trade AMZNx" });
  await sheet.getByRole("button", { name: "Use 50%" }).click();
  await sheet.getByRole("button", { name: "Review sale" }).click();
  await sheet.getByRole("button", { name: "Sign sale" }).click();
  const toasts = page.getByRole("region", { name: "Requests in progress" });
  await expect(toasts).toContainText("Nothing sold: AMZNx", { timeout: 10_000 });
  await expect(toasts).toContainText("Nothing changed hands and nothing was charged.");
  await expect(toasts.getByRole("link", { name: "Sell again" })).toHaveAttribute("href", "/app/positions");
  await page.getByRole("tab", { name: /^Activity/ }).click();
  await expect(page.getByRole("tabpanel", { name: "Activity" })).toContainText("never landed before its deadline", { ignoreCase: true });
});

test("a wallet that declines leaves the sheet open, saying nothing was sent", async ({ page }) => {
  await registerTestWallet(page, { trusted: true, signs: true, declines: true });
  const lot = admissions.instruments.find((entry) => entry.instrument.symbol === "AMZNx")!;
  await page.route("**/api/allocation/positions?**", (route) => route.fulfill({ json: {
    wallet, network: "mainnet", source: "Solana mainnet RPC", observedAt: new Date().toISOString(), outsideRegister: 0,
    positions: [{ mint: lot.instrument.mint, symbol: "AMZNx", atoms: "10000000", sellableAtoms: "10000000", scale: lot.decimals, tokenProgram: lot.token_program }],
  } }));
  await page.route("**/api/allocation/sell/prepare", (route) => route.fulfill({ json: preparedLeg({ inAtoms: "5000000", inScale: lot.decimals }) }));
  const submits = await acceptSubmits(page);

  await page.goto("/app/positions");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("button", { name: "Trade AMZNx" }).click();
  const sheet = page.getByRole("dialog", { name: "Trade AMZNx" });
  await sheet.getByRole("button", { name: "Use 50%" }).click();
  await sheet.getByRole("button", { name: "Review sale" }).click();
  await sheet.getByRole("button", { name: "Sign sale" }).click();
  await expect(sheet.getByRole("alert")).toHaveText("You declined in your wallet. Nothing was sent.");
  await expect(sheet.getByRole("button", { name: "Sign sale" })).toBeEnabled();
  expect(submits()).toBe(0);
  await expect(page.getByRole("region", { name: "Requests in progress" })).toHaveCount(0);
});

test("holdings names the exit route without presenting it as redemption", async ({ page }) => {
  await registerTestWallet(page, { trusted: true });
  const lot = admissions.instruments.find((entry) => entry.instrument.symbol === "AMZNx")!;
  await page.route("**/api/allocation/positions?**", (route) => route.fulfill({ json: {
    wallet,
    network: "mainnet", source: "Solana mainnet RPC", observedAt: new Date().toISOString(), outsideRegister: 0,
    positions: [{ mint: lot.instrument.mint, symbol: "AMZNx", name: "Amazon.com", atoms: "15000000", sellableAtoms: "10000000", scale: lot.decimals, tokenProgram: lot.token_program }],
  } }));
  await page.goto("/app/positions");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  const row = page.getByRole("list", { name: "Instruments in this wallet" }).getByRole("listitem").filter({ hasText: "AMZNx" });
  await expect(row).toContainText("Amazon.com");
  await expect(row).toContainText("0.15");
  await expect(row).toContainText("0.1");
  await page.getByRole("button", { name: "Trade AMZNx" }).click();
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
