import { expect, test, type Page } from "@playwright/test";
import { theme } from "@seametry/ui/tokens";
import { registerTestWallet } from "./test-wallet";

// The sign-in dialog's layout (src/app/connect-modal.tsx over AuthDialog in
// @seametry/ui/modal-sheet): centred on a desktop, a full-width sheet on a
// phone, in either theme. Behaviour is covered by connect-modal.spec.ts.
const signIn = (page: Page) => page.getByRole("dialog", { name: "Sign in to Seametry" });

async function signedOut(page: Page) {
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }));
}

async function resolve(page: Page, css: string) {
  return page.evaluate((value) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = value;
    document.body.append(probe);
    const rendered = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return rendered;
  }, css);
}

test("signed out, the dialog is centred and introduces the account in one line", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signedOut(page);
  await registerTestWallet(page, { trusted: false, signsIn: true });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  const dialog = signIn(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2, name: "Sign in to Seametry" })).toBeVisible();
  await expect(dialog.getByText("Your wallet is your account.", { exact: false })).toBeVisible();
  await page.waitForTimeout(300);
  const box = (await dialog.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - 400)).toBeLessThan(2);
  expect(box.width).toBeLessThanOrEqual(440);
  expect(box.width).toBeGreaterThanOrEqual(360);
});

test("each wallet is a row with its name and a Detected badge, then Google after an or", async ({ page }) => {
  await signedOut(page);
  await registerTestWallet(page, { trusted: false, signsIn: true });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  const dialog = signIn(page);
  const row = dialog.getByRole("button", { name: "Connect Test wallet" });
  await expect(row).toContainText("Test wallet");
  await expect(row).toContainText("Detected");
  await expect(dialog.getByRole("link", { name: "Install Phantom" })).toContainText("Install");
  await expect(dialog.getByRole("separator")).toHaveText("or");
  // Measured once the arrival (a slight scale) has finished.
  await page.waitForTimeout(300);
  for (const target of await dialog.locator("button, a[href]").all()) {
    const box = (await target.boundingBox())!;
    expect(box.height, await target.textContent() ?? "").toBeGreaterThanOrEqual(44);
  }
  await expect(dialog.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(dialog.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy-policy");
  await expect(dialog.getByText("Non-custodial", { exact: false })).toBeVisible();
});

test("on a phone the dialog is a full-width sheet anchored to the bottom, inside the screen", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await context.newPage();
  await signedOut(page);
  await registerTestWallet(page, { trusted: false, signsIn: true });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  const dialog = signIn(page);
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400);
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(375);
  expect(Math.abs(box.y + box.height - 667)).toBeLessThan(1);
  expect(box.height).toBeLessThanOrEqual(667);
  await context.close();
});

test("in dark the dialog paints the dark sheet and its rows read on it", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("seametry-theme-v1", "dark"));
  await signedOut(page);
  await registerTestWallet(page, { trusted: false, signsIn: true });
  await page.goto("/app/allocation");
  await page.locator("#app-wallet").click();
  const dialog = signIn(page);
  await expect(dialog).toBeVisible();
  const background = await dialog.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(background).toBe(await resolve(page, theme.dark.surface.sheet));
  const name = await dialog.getByRole("button", { name: "Connect Test wallet" }).evaluate((node) => getComputedStyle(node).color);
  expect(name).toBe(await resolve(page, theme.dark.text.primary));
});
