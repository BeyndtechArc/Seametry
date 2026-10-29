import { expect, test, type Page } from "@playwright/test";
import { registerTestWallet } from "./test-wallet";

// The header's account chip and menu (src/app/wallet-state.tsx,
// src/app/account-menu.tsx), state by state. The auth and account routes are
// answered here, as the account service would answer them.
const shots = process.env.SEAMETRY_AUTH_SHOTS;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

const address = "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d";
const input = {
  domain: "localhost:3847", statement: "Sign in to Seametry. This does not approve a transaction.", uri: "http://localhost:3847",
  version: "1", chainId: "solana:mainnet", nonce: "c".repeat(48), issuedAt: "2026-10-29T12:00:00.000Z", expirationTime: "2026-10-29T12:05:00.000Z",
};

type Account = { email: string; emailVerified: boolean; providers: string[]; wallets: string[] };
const walletOnly: Account = { email: "0c4f@wallet.seametry.invalid", emailVerified: false, providers: ["solana"], wallets: [address] };
const walletAndGoogle: Account = { email: "storm@example.com", emailVerified: true, providers: ["solana", "google"], wallets: [address] };
const googleOnly: Account = { email: "storm@example.com", emailVerified: true, providers: ["google"], wallets: [] };

async function signedIn(page: Page, account: Account | undefined) {
  let current = account ? { ...account, wallets: [...account.wallets] } : undefined;
  const calls = { signOut: 0, verify: 0 };
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: current ? { session: { id: "session-1", userId: "account-1a2b3c4d" }, user: { id: "account-1a2b3c4d", email: current.email, emailVerified: current.emailVerified, name: "Holder" } } : null }));
  await page.route("**/api/auth/list-accounts", (route) => route.fulfill({ json: (current?.providers ?? []).map((providerId) => ({ providerId, accountId: providerId === "solana" ? address : "google-1" })) }));
  await page.route("**/api/account/wallets", (route) => route.fulfill(current ? { json: { wallets: current.wallets.map((wallet) => ({ address: wallet, verified_at: "2026-10-29T12:00:00.000Z" })) } } : { status: 401, json: { error: "Sign in to read linked wallets." } }));
  await page.route("**/api/auth/sign-out", (route) => {
    calls.signOut += 1;
    current = undefined;
    return route.fulfill({ json: { success: true } });
  });
  await page.route("**/api/auth/solana/nonce", (route) => route.fulfill({ json: { input } }));
  await page.route("**/api/auth/solana/verify", (route) => {
    calls.verify += 1;
    if (current && !current.wallets.includes(address)) current.wallets.push(address);
    return route.fulfill({ json: { linked: true, user: { id: "account-1a2b3c4d", walletAddress: address } } });
  });
  return calls;
}

const chip = (page: Page) => page.locator("#app-wallet");

// A wallet chosen on an earlier visit: the provider reconnects it on load.
async function chosenBefore(page: Page) {
  await page.addInitScript(() => localStorage.setItem("walletName", JSON.stringify("Test wallet")));
}
const menu = (page: Page) => page.getByTestId("account-menu");

test("signed out with no wallet, the chip reads Connect and opens the modal", async ({ page }) => {
  await signedIn(page, undefined);
  await page.goto("/app/allocation");
  await expect(chip(page)).toHaveAttribute("data-account", "signed-out");
  await expect(chip(page)).toHaveText("Connect");
  await shot(page, "chip-signed-out");
  await chip(page).click();
  await expect(page.getByRole("dialog", { name: "Connect a wallet" })).toBeVisible();
});

test("a wallet-only account: short address, no email yet, its short id, and copy", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signedIn(page, walletOnly);
  await registerTestWallet(page, { trusted: true });
  await chosenBefore(page);
  await page.goto("/app/allocation");
  await expect(chip(page)).toHaveAttribute("data-account", "wallet");
  await expect(chip(page)).toContainText("4vJ9…nX1d");
  await expect(chip(page).getByTestId("account-initial")).toHaveCount(0);
  await shot(page, "chip-wallet-only");
  await chip(page).click();
  await expect(menu(page)).toContainText("No email yet");
  await expect(menu(page)).toContainText("Account account-");
  await expect(menu(page)).toContainText("Signed in with a wallet");
  await expect(menu(page).getByRole("listitem").filter({ hasText: address })).toHaveCount(1);
  await shot(page, "menu-wallet-only");
  await menu(page).getByRole("button", { name: `Copy ${address}` }).first().click();
  await expect(menu(page).getByRole("status").filter({ hasText: "Address copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(address);
});

test("a wallet plus email: the email's initial sits in the chip, and the menu names both methods", async ({ page }) => {
  await signedIn(page, walletAndGoogle);
  await registerTestWallet(page, { trusted: true });
  await chosenBefore(page);
  await page.goto("/app/allocation");
  await expect(chip(page)).toHaveAttribute("data-account", "wallet-email");
  await expect(chip(page).getByTestId("account-initial")).toHaveText("S");
  await shot(page, "chip-wallet-email");
  await chip(page).click();
  await expect(menu(page)).toContainText("storm@example.com");
  await expect(menu(page)).toContainText("Signed in with a wallet and Google");
});

test("Google with no wallet: the chip offers to link one, and linking signs with the wallet", async ({ page }) => {
  const calls = await signedIn(page, googleOnly);
  await registerTestWallet(page, { trusted: false, signsIn: true });
  await page.goto("/app/allocation");
  await expect(chip(page)).toHaveAttribute("data-account", "email");
  await expect(chip(page)).toContainText("Link wallet");
  await shot(page, "chip-google-no-wallet");
  await chip(page).click();
  await expect(menu(page)).toContainText("No wallet linked yet.");
  await menu(page).getByRole("button", { name: "Link a wallet" }).click();
  await page.getByRole("dialog", { name: "Connect a wallet" }).getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(page.getByRole("dialog", { name: "Connect a wallet" })).toBeHidden();
  expect(calls.verify).toBe(1);
  await expect(menu(page).getByRole("listitem").filter({ hasText: address })).toHaveCount(1);
});

test("while the balance is read, the chip shows a placeholder, not a number", async ({ page }) => {
  await signedIn(page, walletOnly);
  await page.route("**/api/wallet/balances**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.fallback();
  });
  await registerTestWallet(page, { trusted: true });
  await chosenBefore(page);
  await page.goto("/app/allocation");
  await expect(chip(page).getByTestId("balance-reading")).toBeVisible();
  await shot(page, "chip-balance-loading");
});

test("a wallet on another network is flagged, with what to switch to", async ({ page }) => {
  await signedIn(page, walletOnly);
  await registerTestWallet(page, { trusted: true, chains: ["solana:devnet"] });
  await chosenBefore(page);
  await page.goto("/app/allocation");
  await expect(chip(page)).toHaveAttribute("data-network", "wrong");
  await shot(page, "chip-wrong-network");
  await chip(page).click();
  await expect(page.getByTestId("wallet-account").getByRole("alert")).toHaveText("Test wallet is not set to Solana mainnet. Switch its network to mainnet.");
});

test("a connected wallet the account has not linked is flagged, and can be linked", async ({ page }) => {
  const calls = await signedIn(page, { ...googleOnly });
  await registerTestWallet(page, { trusted: true, signsIn: true });
  await chosenBefore(page);
  await page.goto("/app/allocation");
  await expect(chip(page)).toHaveAttribute("data-linked", "false");
  await chip(page).click();
  const account = page.getByTestId("wallet-account");
  await expect(account).toContainText("This wallet is not linked to your account.");
  await shot(page, "menu-unlinked-wallet");
  await account.getByRole("button", { name: "Link this wallet" }).click();
  await expect(chip(page)).toHaveAttribute("data-linked", "true");
  expect(calls.verify).toBe(1);
});

test("sign out ends the session and the chip returns to the wallet alone", async ({ page }) => {
  const calls = await signedIn(page, walletAndGoogle);
  await registerTestWallet(page, { trusted: true });
  await chosenBefore(page);
  await page.goto("/app/allocation");
  await chip(page).click();
  await menu(page).getByRole("button", { name: "Sign out" }).click();
  await expect(chip(page)).toHaveAttribute("data-account", "signed-out");
  expect(calls.signOut).toBe(1);
  await expect(page.getByLabel(/Wallet 4vJ9/)).toBeVisible();
});

test("switch wallet disconnects this one and opens the modal", async ({ page }) => {
  await signedIn(page, walletOnly);
  await registerTestWallet(page, { trusted: true });
  await chosenBefore(page);
  await page.goto("/app/allocation");
  await chip(page).click();
  await page.getByTestId("wallet-account").getByRole("button", { name: "Switch wallet" }).click();
  await expect(page.getByRole("dialog", { name: "Connect a wallet" })).toBeVisible();
  await expect(chip(page)).not.toHaveAttribute("data-connected", /.*/);
});
