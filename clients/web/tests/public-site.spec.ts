import { expect, test } from "@playwright/test";

test("the landing leads with the recorded issuer-freeze incident", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Open AP ETFs" })).toBeVisible();
  const apField = page.getByTestId("open-ap-field");
  for (const label of ["Any wallet", "Strike", "Alloy", "Melt", "Claims"]) {
    await expect(apField.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Recorded on Solana devnet", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "A melt survives the freeze." })).toBeVisible();
  await expect(page.getByText("HallAccountFrozen", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inspect demonstration" })).toHaveAttribute("href", "/hall-demo");

  for (const section of ["What changes", "The instrument, opened", "Why an ETF", "What you can inspect now"]) {
    await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
  }
});

test("the public narrative and Key pages keep their claims bounded", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByRole("heading", { level: 1, name: "The basket is a mechanism." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "A claim is not the underlying." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "A bundle stops at assembly." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "The authorized participant set is everyone." })).toBeVisible();

  await page.goto("/the-key");
  await expect(page.getByRole("heading", { level: 1, name: "The Key is still in hand." })).toBeVisible();
  await expect(page.getByText("Devnet Hall. Key still in hand.", { exact: true })).toBeVisible();
  await expect(page.getByText("The melt always works. Delivery is each issuer's.", { exact: true })).toBeVisible();
});

test("sign in states the unavailable identity boundary without collecting a wallet", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByRole("heading", { level: 1, name: "No account needed." })).toBeVisible();
  await expect(page.getByText("Signing in, for saved formulas and watchlists, is API step A6 and is not built.", { exact: true })).toBeVisible();
  // Nothing on the page can be pressed that does not work: the unbuilt sign-in has no control at all.
  await expect(page.getByRole("button", { name: "Sign message" })).toHaveCount(0);
  await expect(page.getByRole("main").locator("input")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("link", { name: "Open the Allocation" })).toHaveAttribute("href", "/allocation");
});

test("the house rail shows the wallet state on every page, and connecting signs nothing", async ({ page }) => {
  await page.goto("/");
  const rail = page.getByRole("banner");
  const state = rail.locator("summary", { hasText: "Connect wallet" });
  await expect(state).toBeVisible();
  await state.click();
  // A test browser has no wallet extension, so the no-wallet state is the one reachable here.
  await expect(rail.getByText("No wallet was detected in this browser. On a phone, open this site inside your wallet's own browser.", { exact: true })).toBeVisible();

  await page.goto("/allocation");
  await expect(page.getByRole("banner").locator("summary", { hasText: "Connect wallet" })).toBeVisible();
});

test("the public rail reaches every available destination", async ({ page }) => {
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/");
  await expect(navigation.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/how-it-works");
  await expect(navigation.getByRole("link", { name: "Hall demo" })).toHaveAttribute("href", "/hall-demo");
  await expect(navigation.getByRole("link", { name: "Allocation" })).toHaveAttribute("href", "/allocation");
  await expect(navigation.getByRole("link", { name: "Terminal" })).toHaveAttribute("href", "/terminal");
  await expect(navigation.getByRole("link", { name: "The Key" })).toHaveAttribute("href", "/the-key");
  await expect(navigation.getByRole("link", { name: "Access" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use light mode" })).toBeVisible();
});

test("the live Hall demonstration remains inside the public journey", async ({ page }) => {
  await page.goto("/hall-demo");

  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Hall demo" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "The Hall, live on devnet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Seametry Public" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Inspect live Alloys" })).toHaveAttribute("href", "/terminal/alloys");
});

test("an unknown public route returns a useful route index", async ({ page }) => {
  await page.goto("/a-route-that-is-not-registered");

  await expect(page.getByRole("heading", { level: 1, name: "That route is not in the register." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the overview" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Open the Terminal" })).toHaveAttribute("href", "/terminal");
});
