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
  await expect(page.getByRole("link", { name: "Inspect demonstration" })).toHaveAttribute("href", "/app/hall");

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
  await expect(page.getByRole("main").getByRole("link", { name: "Open the Allocation" })).toHaveAttribute("href", "/app/allocation");
});

test("the wallet state lives in the app's top bar, and connecting signs nothing", async ({ page }) => {
  await page.goto("/");
  // The public rail carries reading pages and one way into the app, never a wallet.
  await expect(page.getByRole("banner").locator("summary", { hasText: "Connect wallet" })).toHaveCount(0);

  await page.goto("/app");
  const bar = page.getByRole("banner");
  const state = bar.locator("summary", { hasText: "Connect wallet" });
  await expect(state).toBeVisible();
  await state.click();
  // A test browser has no wallet extension, so the no-wallet state is the one reachable here.
  await expect(bar.getByText("No wallet was detected in this browser. On a phone, open this site inside your wallet's own browser.", { exact: true })).toBeVisible();

  await page.goto("/app/allocation");
  await expect(page.getByRole("banner").locator("summary", { hasText: "Connect wallet" })).toBeVisible();
});

test("the public rail carries reading pages and one way into the app", async ({ page }) => {
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/how-it-works");
  await expect(navigation.getByRole("link", { name: "The Key" })).toHaveAttribute("href", "/the-key");
  for (const product of ["Hall demo", "Allocation", "Terminal"]) {
    await expect(navigation.getByRole("link", { name: product })).toHaveCount(0);
  }
  await expect(page.getByRole("banner").getByRole("link", { name: "Open app" })).toHaveAttribute("href", "/app");
  await expect(page.getByRole("banner").getByRole("link", { name: "Seametry", exact: true })).toHaveAttribute("href", "/");
  await expect(page.getByRole("banner").getByText("Public", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use dark mode" })).toBeVisible();
});

test("the Hall demonstration lives in the app, marked devnet", async ({ page }) => {
  await page.goto("/app/hall");

  await expect(page.getByRole("navigation", { name: "Product" }).getByRole("link", { name: "Demonstration" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Demonstration" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Devnet", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inspect live Alloys" })).toHaveAttribute("href", "/app/alloys");
});

test("every app page names its network, and the sidebar and tab bar share one route list", async ({ page }) => {
  for (const [path, network] of [
    ["/app", "Mainnet evidence"],
    ["/app/allocation", "Mainnet"],
    ["/app/hall", "Devnet"],
    ["/app/alloys/storm", "Devnet"],
    ["/app/instruments", "Mainnet evidence"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("main").getByText(network, { exact: true }).first(), `${path} names ${network}`).toBeVisible();
  }

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/app/alloys/storm");
  const tabs = page.getByRole("navigation", { name: "Product sections" });
  await expect(tabs.getByRole("link")).toHaveText(["Desk", "Buy", "Hall", "Assay"]);
  await expect(tabs.getByRole("link", { name: "Hall" })).toHaveAttribute("aria-current", "page");
});

test("no page scrolls sideways on a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  for (const path of ["/", "/app", "/app/allocation", "/app/alloys", "/app/alloys/storm", "/app/hall", "/app/instruments", "/how-it-works", "/sign-in", "/the-key"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    // scrollWidth, not a visible scrollbar: the root hides horizontal overflow,
    // which stops a scrollbar but not a finger dragging the page sideways.
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `${path} is ${width}px wide`).toBe(320);
  }
});

test("links shared before the move still arrive", async ({ page }) => {
  for (const [from, to] of [
    ["/allocation", "/app/allocation"],
    ["/hall-demo", "/app/hall"],
    ["/terminal", "/app/instruments"],
    ["/terminal/alloys", "/app/alloys"],
    ["/terminal/alloys/storm", "/app/alloys/storm"],
  ] as const) {
    await page.goto(from);
    await expect(page, `${from} arrives at ${to}`).toHaveURL(to);
  }
});

test("light is the default, and a stored dark choice is honoured", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  // A dark system preference does not override the default.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Use dark mode" })).toBeVisible();

  await page.getByRole("button", { name: "Use dark mode" }).click();
  await page.goto("/app");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await context.close();
});

test("an unknown public route returns a useful route index", async ({ page }) => {
  await page.goto("/a-route-that-is-not-registered");

  await expect(page.getByRole("heading", { level: 1, name: "That route is not in the register." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the overview" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("main").getByRole("link", { name: "Open the app" })).toHaveAttribute("href", "/app");
});
