import { expect, test } from "@playwright/test";
import { walletOptInLabel } from "../src/app/components/email-optin/wallet-label";

// The opt-in keeps the wallet the browser shows as connected, and nothing
// proves the visitor controls it (CR6), so the line offering it must say
// so and promise nothing that only a proven wallet could earn.
test("the opt-in's wallet line says the wallet is kept unverified and promises nothing about its trades", () => {
  const line = walletOptInLabel("FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM");
  expect(line).toContain("FFyr…N5DM");
  expect(line).toContain("unverified");
  expect(line).not.toMatch(/my connected wallet|name its trades/);
});
