import { expect, test, type Page } from "@playwright/test";
import bs58 from "bs58";
import { admissions } from "../src/lib/allocation/admissions";
import type { Execution } from "../src/lib/execution/record";
import { fromServer, mergeHistory, type HistoryAnswer, type WalletExecution } from "../src/lib/execution/server-history";
import { registerTestWallet } from "./test-wallet";
import { TEST_WALLET } from "./execution-fixture";

const wallet = TEST_WALLET;
const [aapl, nvda] = ["AAPLx", "NVDAx"].map((symbol) => admissions.instruments.find((entry) => entry.instrument.symbol === symbol)!);
const signature = (fill: number) => bs58.encode(new Uint8Array(64).fill(fill));
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/** A two-stock basket bought on another device: one leg the chain confirmed, one Seametry has no answer for. */
function basketBoughtElsewhere(): WalletExecution {
  return {
    quote_id: "5f0c2f5e-7a1d-4c2b-9b8e-1d2c3b4a5f60", wallet, kind: "buy", subject: "Prime Seven", template_id: "prime-seven", plan_size: 2,
    prepared_at: hoursAgo(3), source: "server",
    legs: [
      { id: "0d6a4d2e-1b3c-4e5f-8a7b-9c0d1e2f3a40", mint: aapl.instrument.mint, symbol: "AAPLx", signature: signature(41), submitted_at: hoursAgo(3), submit_result: "sent", source: "server",
        spend: { atoms: "1000000", scale: 6 }, chain: { outcome: "landed", block_time: hoursAgo(3), reconciled_at: hoursAgo(3), wallet_usdc_delta: "-1000000", wallet_token_delta: "400000", token_scale: aapl.decimals } },
      { id: "0d6a4d2e-1b3c-4e5f-8a7b-9c0d1e2f3a41", mint: nvda.instrument.mint, symbol: "NVDAx", signature: signature(42), submitted_at: hoursAgo(3), submit_result: "sent", source: "server",
        spend: { atoms: "1000000", scale: 6 } },
    ],
  };
}

test("a server leg settles only on the chain's answer, and one without it reads as unconfirmed", () => {
  const recorded = basketBoughtElsewhere();
  const [record] = fromServer([recorded]);
  expect(record.recordedBy).toBe("server");
  expect(record.allocation).toEqual({ id: "5f0c2f5e-7a1d-4c2b-9b8e-1d2c3b4a5f60", name: "Prime Seven", templateId: "prime-seven" });
  expect(record.legs[0]).toMatchObject({ phase: "landed", chainAnswer: "landed", received: { atoms: "400000", scale: aapl.decimals, unit: "AAPLx" } });
  expect(record.legs[1].phase).toBe("sent");
  expect(record.legs[1].chainAnswer).toBeUndefined();
  expect(record.legs[1].received).toBeUndefined();
  expect(record.unreadable?.since).toBe(recorded.legs[1].submitted_at);
});

test("a trade found only on chain takes its spend from what left the wallet", () => {
  const [record] = fromServer([{
    quote_id: "5f0c2f5e-7a1d-4c2b-9b8e-1d2c3b4a5f61", wallet, kind: "sell", plan_size: 1, prepared_at: hoursAgo(30), source: "chain",
    legs: [{ id: "0d6a4d2e-1b3c-4e5f-8a7b-9c0d1e2f3a42", mint: nvda.instrument.mint, signature: signature(43), submitted_at: hoursAgo(30), submit_result: "sent", source: "chain",
      chain: { outcome: "landed", reconciled_at: hoursAgo(29), wallet_usdc_delta: "995000", wallet_token_delta: "-5000000", token_scale: 8 } }],
  }]);
  expect(record.recordedBy).toBe("chain");
  expect(record.allocation).toBeUndefined();
  expect(record.legs[0].spend).toEqual({ atoms: "5000000", scale: 8, unit: record.legs[0].symbol });
  expect(record.legs[0].received).toEqual({ atoms: "995000", scale: 6, unit: "USDC" });
});

test("a failed or dropped leg carries the chain's own outcome, never a confirmation of settlement", () => {
  const recorded = basketBoughtElsewhere();
  recorded.legs[0].chain = { ...recorded.legs[0].chain!, outcome: "failed", wallet_usdc_delta: "0", wallet_token_delta: "0" };
  recorded.legs[1].chain = { outcome: "dropped", reconciled_at: hoursAgo(2) };
  const [record] = fromServer([recorded]);
  expect(record.legs.map((leg) => [leg.phase, leg.chainAnswer])).toEqual([["failed", "failed"], ["dropped", "dropped"]]);
  expect(record.legs.every((leg) => leg.received === undefined)).toBe(true);
});

test("Activity words each chain answer by its outcome: settled, a confirmed failure, or expired unseen", async ({ page }) => {
  const recorded = basketBoughtElsewhere();
  recorded.legs[1].chain = { outcome: "dropped", reconciled_at: hoursAgo(2) };
  const failed = { ...basketBoughtElsewhere(), quote_id: "5f0c2f5e-7a1d-4c2b-9b8e-1d2c3b4a5f62", subject: "Failed basket", plan_size: 1, template_id: undefined };
  failed.legs = [{ ...failed.legs[0], id: "0d6a4d2e-1b3c-4e5f-8a7b-9c0d1e2f3a49", signature: signature(49), chain: { outcome: "failed", reconciled_at: hoursAgo(3) } }];
  await answerHistory(page, { state: "recorded", wallets: [wallet], executions: [recorded, failed], readAt: new Date().toISOString() });
  await openHoldings(page);
  await page.getByRole("tab", { name: /^Activity/ }).click();
  const activity = page.getByRole("tabpanel", { name: "Activity" });
  await expect(activity).toContainText("Settled on chain");
  await expect(activity).toContainText("Expired; mainnet never saw it");
  await expect(activity).toContainText("Failed; the chain confirmed the failure");
  await expect(activity).not.toContainText("Confirmed on chain");
});

test("the same trade held by this browser and Seametry's record appears once, as this browser's", () => {
  const server = fromServer([basketBoughtElsewhere()]);
  const local: Execution = { ...server[0], id: signature(41), recordedBy: undefined, unreadable: undefined, createdAt: hoursAgo(3) };
  const merged = mergeHistory([local], server);
  expect(merged).toHaveLength(1);
  expect(merged[0].recordedBy).toBeUndefined();
  expect(mergeHistory([], server)).toHaveLength(1);
});

async function answerHistory(page: Page, answer: HistoryAnswer, status = 200) {
  await page.route("**/api/history", (route) => route.fulfill({ status, json: answer }));
  await page.route("**/api/allocation/positions?**", (route) => route.fulfill({ json: {
    wallet, network: "mainnet", source: "Solana mainnet RPC", observedAt: new Date().toISOString(), outsideRegister: 0,
    positions: [aapl, nvda].map((lot) => ({ mint: lot.instrument.mint, symbol: lot.instrument.symbol, atoms: "900000", sellableAtoms: "900000", scale: lot.decimals, tokenProgram: lot.token_program })),
  } }));
}

async function openHoldings(page: Page) {
  await registerTestWallet(page, { trusted: true });
  await page.goto("/app/positions");
  await page.getByText("Sign in", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
}

test("a new browser shows a linked wallet's basket from Seametry's record, labelled by whose word each part is", async ({ page }) => {
  await answerHistory(page, { state: "recorded", wallets: [wallet], executions: [basketBoughtElsewhere()], readAt: new Date().toISOString() });
  await openHoldings(page);
  await page.getByRole("tab", { name: /^Allocations/ }).click();
  const allocations = page.getByRole("tabpanel", { name: "Allocations" });
  await expect(allocations).toContainText("Seametry's record of this linked wallet");
  // Only the leg the chain confirmed counts toward what the Allocation holds.
  const row = page.getByRole("button", { name: "Sell Prime Seven" });
  await expect(row).toContainText("AAPLx");
  await expect(row).not.toContainText("NVDAx");

  await page.getByRole("tab", { name: /^Activity/ }).click();
  const activity = page.getByRole("tabpanel", { name: "Activity" });
  await expect(activity).toContainText("Seametry's record for your linked wallet");
  await expect(activity).toContainText("From Seametry's record");
  await expect(activity).toContainText("Settled on chain");
  // Stale: sent hours ago and still unanswered, so it is not called settling.
  await expect(activity).toContainText("Sent; Seametry has no answer from mainnet for it yet");
  await expect(activity).not.toContainText("waiting for mainnet");
  // Another device's trade is history here, never a toast.
  await expect(page.locator("[aria-label='Requests in progress']", { hasText: "Prime Seven" })).toHaveCount(0);
});

test("an account whose record holds nothing for the wallet says so, not that only this browser was read", async ({ page }) => {
  await answerHistory(page, { state: "recorded", wallets: [wallet], executions: [], readAt: new Date().toISOString() });
  await openHoldings(page);
  await page.getByRole("tab", { name: /^Allocations/ }).click();
  await expect(page.getByText("No Allocation recorded for this wallet")).toBeVisible();
  await page.getByRole("tab", { name: /^Activity/ }).click();
  await expect(page.getByRole("tabpanel", { name: "Activity" }).getByText("Nothing bought or sold yet", { exact: true })).toBeVisible();
});

test("a wallet the signed-in account has not linked shows this browser's records alone, and says why", async ({ page }) => {
  await answerHistory(page, { state: "recorded", wallets: ["FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM"], executions: [], readAt: new Date().toISOString() });
  await openHoldings(page);
  await page.getByRole("tab", { name: /^Allocations/ }).click();
  await expect(page.getByText("This wallet is not linked to your account")).toBeVisible();
  await expect(page.getByText("No Allocation bought from this browser")).toBeVisible();
});

test("when Seametry's record cannot be read, the page says other devices' trades are missing", async ({ page }) => {
  await answerHistory(page, { state: "unavailable", detail: "Seametry's record answered 503." }, 503);
  await openHoldings(page);
  await page.getByRole("tab", { name: /^Activity/ }).click();
  await expect(page.getByRole("tabpanel", { name: "Activity" })).toContainText("Seametry's record could not be read");
  await expect(page.getByRole("tabpanel", { name: "Activity" })).toContainText("Trades made on other devices are missing");
});

test("signed out, the history route reads nothing and the page names this browser as the only source", async ({ page, request }) => {
  const response = await request.get("/api/history", { headers: { cookie: "better-auth.session_token=forged" } });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ state: "signed-out" });
  await openHoldings(page);
  await page.getByRole("tab", { name: /^Activity/ }).click();
  await expect(page.getByRole("tabpanel", { name: "Activity" })).toContainText("This browser's records only.");
});
