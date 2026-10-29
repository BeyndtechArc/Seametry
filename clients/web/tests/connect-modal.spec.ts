import { expect, test, type Page } from "@playwright/test";
import { registerTestWallet } from "./test-wallet";

// The connect modal (src/app/connect-modal.tsx): one dialog from the Connect
// control, wallets first, then Google. The auth routes are answered here, as
// the account service would answer them through the proxy.
const shots = process.env.SEAMETRY_AUTH_SHOTS;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

const input = {
  domain: "localhost:3847", statement: "Sign in to Seametry. This does not approve a transaction.", uri: "http://localhost:3847",
  version: "1", chainId: "solana:mainnet", nonce: "b".repeat(48), issuedAt: "2026-10-29T12:00:00.000Z", expirationTime: "2026-10-29T12:05:00.000Z",
};
const signedInUser = { id: "account-1", email: "4vj9@wallet.seametry.invalid", emailVerified: false, name: "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d" };

async function account(page: Page, { signedIn = false, verify = { status: 200, body: { user: { id: "account-1", walletAddress: "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d" } } } as { status: number; body: unknown }, verifyDelay = 0 } = {}) {
  let session = signedIn;
  const calls = { nonce: 0, verify: [] as unknown[] };
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: session ? { session: { id: "session-1", userId: "account-1" }, user: signedInUser } : null }));
  await page.route("**/api/auth/solana/nonce", (route) => {
    calls.nonce += 1;
    return route.fulfill({ json: { input } });
  });
  await page.route("**/api/auth/solana/verify", async (route) => {
    calls.verify.push(route.request().postDataJSON());
    if (verifyDelay) await new Promise((resolve) => setTimeout(resolve, verifyDelay));
    if (verify.status === 200) session = true;
    return route.fulfill({ status: verify.status, json: verify.body });
  });
  return calls;
}

const modal = (page: Page) => page.getByRole("dialog", { name: "Connect a wallet" });

test("Connect opens one modal: wallets first, then Google, and no email option yet", async ({ page }) => {
  await account(page);
  await registerTestWallet(page, { trusted: false, signsIn: true });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  const dialog = modal(page);
  await expect(dialog).toBeVisible();
  const options = dialog.getByRole("button");
  await expect(dialog.getByRole("button", { name: "Connect Test wallet" })).toBeVisible();
  const labels = await options.allTextContents();
  expect(labels.indexOf("Connect Test wallet")).toBeLessThan(labels.indexOf("Continue with Google"));
  await expect(dialog.getByText(/email/i)).toHaveCount(0);
  await shot(page, "modal-choose");
});

test("detected wallets list Phantom, Solflare and Backpack first, then the rest", async ({ page }) => {
  await account(page);
  for (const name of ["Zeta", "Backpack", "Solflare", "Phantom"]) await registerTestWallet(page, { trusted: false, name });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  const names = await modal(page).getByRole("button", { name: /^Connect / }).allTextContents();
  expect(names).toEqual(["Connect Phantom", "Connect Solflare", "Connect Backpack", "Connect Zeta"]);
});

test("Escape closes the modal and returns focus to Connect; Tab stays inside it", async ({ page }) => {
  await account(page);
  await registerTestWallet(page, { trusted: false, signsIn: true });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").focus();
  await page.keyboard.press("Enter");
  const dialog = modal(page);
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#app-wallet")).toBeFocused();
});

test("a wallet that can sign in connects, signs the service's message, and the modal closes signed in", async ({ page }) => {
  const calls = await account(page, { verifyDelay: 600 });
  await registerTestWallet(page, { trusted: false, signsIn: true });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  await modal(page).getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(modal(page).getByRole("status")).toContainText("Confirming the signature");
  await shot(page, "modal-signing");
  await expect(modal(page)).toBeHidden();
  expect(calls.nonce).toBe(1);
  expect(calls.verify).toHaveLength(1);
  expect(calls.verify[0]).toMatchObject({ nonce: input.nonce, output: { address: "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d" } });
});

test("a declined signature says so, and offers a retry or the connected wallet alone", async ({ page }) => {
  const calls = await account(page);
  await registerTestWallet(page, { trusted: false, signsIn: true, declinesSignIn: true });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  const dialog = modal(page);
  await dialog.getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("The wallet declined to sign. Nothing changed.");
  await shot(page, "modal-rejected");
  expect(calls.verify).toHaveLength(0);
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("The wallet declined to sign. Nothing changed.");
  expect(calls.nonce).toBe(2);
  await dialog.getByRole("button", { name: "Continue without signing in" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel(/Wallet 4vJ9/)).toBeVisible();
});

for (const [label, verify, text] of [
  ["a wallet owned by another account", { status: 409, body: { code: "WALLET_OWNED" } }, "This wallet belongs to another Seametry account. Sign out and sign in with it to use that account."],
  ["an expired sign-in request", { status: 401, body: { code: "INVALID_NONCE" } }, "The sign-in request expired. Try again."],
] as const) test(`${label} has its own words`, async ({ page }) => {
  await account(page, { verify });
  await registerTestWallet(page, { trusted: false, signsIn: true });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  await modal(page).getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(modal(page).getByRole("alert")).toHaveText(text);
  if (verify.status === 409) await shot(page, "modal-owned-elsewhere");
});

test("a wallet that cannot sign messages still connects, and the modal closes", async ({ page }) => {
  const calls = await account(page);
  await registerTestWallet(page, { trusted: false });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  await modal(page).getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(modal(page)).toBeHidden();
  await expect(page.getByLabel(/Wallet 4vJ9/)).toBeVisible();
  expect(calls.nonce).toBe(0);
});

test("no wallet in a desktop browser: install links, and Google still offered", async ({ page }) => {
  await account(page);
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  const dialog = modal(page);
  await expect(dialog.getByText("No signing wallet is available in this browser.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Install Phantom" })).toHaveAttribute("href", "https://phantom.com/download");
  await expect(dialog.getByRole("link", { name: "Install Solflare" })).toHaveAttribute("href", "https://solflare.com/download");
  await expect(dialog.getByRole("link", { name: "Install Backpack" })).toHaveAttribute("href", "https://backpack.app/download");
  await expect(dialog.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await shot(page, "modal-no-wallet");
});

test("no wallet on a phone: open this page in Phantom or Solflare, inside the screen", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const page = await context.newPage();
  await account(page);
  await page.goto("/app/positions");
  await page.locator("#app-wallet").click();
  const dialog = modal(page);
  const phantom = dialog.getByRole("link", { name: "Open this page in Phantom" });
  await expect(phantom).toBeVisible();
  expect(await phantom.getAttribute("href")).toContain("https://phantom.com/ul/browse/");
  await expect(dialog.getByRole("link", { name: "Open this page in Solflare" })).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390.5);
  await shot(page, "modal-phone-no-wallet");
  await context.close();
});

test("already signed in: the modal names the account and connecting asks for no signature", async ({ page }) => {
  const calls = await account(page, { signedIn: true });
  await registerTestWallet(page, { trusted: false, signsIn: true });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  const dialog = modal(page);
  await expect(dialog.getByText("You are signed in.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await shot(page, "modal-signed-in");
  await dialog.getByRole("button", { name: "Connect Test wallet" }).click();
  await expect(dialog).toBeHidden();
  expect(calls.nonce).toBe(0);
});
