import { expect, test } from "@playwright/test";
import { admissions } from "../src/lib/allocation/admissions";
import { registerTestWallet } from "./test-wallet";

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
  await expect(sheet.getByRole("link", { name: "Buy AMZNx" })).toHaveAttribute("href", `/app/allocation?add=${encodeURIComponent(lot.instrument.mint)}`);
  await sheet.getByRole("tab", { name: "Sell" }).click();
  await sheet.getByRole("button", { name: "Use 50%" }).click();
  await expect(sheet.getByLabel("Amount of AMZNx to sell")).toHaveValue("0.05");
  await page.getByRole("button", { name: "Use available balance" }).click();
  await expect(page.getByLabel("Amount of AMZNx to sell")).toHaveValue("0.1");
  await page.getByLabel("Amount of AMZNx to sell").fill("0.2");
  await expect(page.getByText(/associated token account holds/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review sale" })).toBeDisabled();
});
