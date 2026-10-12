import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { PublicKey } from "@solana/web3.js";

test("saved to a home screen, the site opens on Baskets with icons at the sizes it names", async ({ page, request }) => {
  await page.goto("/");
  const manifestHref = await page.locator("link[rel=manifest]").getAttribute("href");
  expect(await page.locator("link[rel=apple-touch-icon]").getAttribute("href")).toBe("/icons/apple-touch-icon.png");
  const manifest = await (await request.get(manifestHref!)).json();
  expect({ start_url: manifest.start_url, display: manifest.display }).toEqual({ start_url: "/app/baskets", display: "standalone" });
  const icons = [...manifest.icons, { src: "/icons/apple-touch-icon.png", sizes: "180x180" }];
  for (const icon of icons) {
    const png = await (await request.get(icon.src)).body();
    // A PNG's IHDR chunk holds its width and height at bytes 16 and 20.
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.src).toBe(icon.sizes);
  }
});

test("on a phone, stock rows stay compact and the count sits beside the next action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/allocation");
  const main = page.getByRole("main");
  const lot = main.locator('[aria-label="Choose the constituents"] > ul > li').first();
  await expect(lot.getByRole("checkbox")).toBeVisible();
  await expect(lot.getByRole("link", { name: /Open .* assay/ })).toBeVisible();
  await expect(lot.getByText("Warn", { exact: true })).toHaveCount(0);
  const rowBox = await lot.boundingBox();
  expect(rowBox!.height).toBeLessThan(112);
  const count = main.locator("output");
  const action = main.getByRole("button", { name: "Set amount" });
  const [countBox, actionBox] = [await count.boundingBox(), await action.boundingBox()];
  expect(Math.abs(countBox!.y + countBox!.height / 2 - (actionBox!.y + actionBox!.height / 2))).toBeLessThan(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("the landing leads with the recorded issuer-freeze incident", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Open AP ETFs" })).toBeVisible();
  const press = page.getByRole("figure", { name: "The Hall's press" });
  await expect(press.getByRole("img", { name: "The Hall's press" })).toBeVisible();
  await expect(press.getByRole("button", { name: "Strike 1 share" })).toBeVisible();
  await expect(press.getByRole("button", { name: "Melt 1 share" })).toBeVisible();
  await expect(page.getByText("Recorded on Solana devnet", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "A melt survives the freeze." })).toBeVisible();
  await expect(page.getByText("HallAccountFrozen", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Open app" })).toHaveAttribute("href", "/app");

  for (const section of ["What changes", "The instrument, opened", "Why an ETF", "What you can inspect now"]) {
    await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
  }
});

// Read straight from the evidence files rather than through the page's own
// module, so a figure the module derives wrongly cannot agree with itself.
function evidence(path: string) {
  return JSON.parse(readFileSync(`../../shared/evidence/${path}`, "utf8"));
}

test("The exit states the figures the committed evidence holds", async ({ page }) => {
  const survey = evidence("multiplier-staleness-2026-09-23.json");
  const depth = evidence("depth-2026-10-04.json");
  const admissions = evidence("admissions.json");
  const freeze = evidence("hall-demo/transcript-devnet.json").scenarios.find((scenario: { id: string }) => scenario.id === "freeze");

  await page.goto("/docs/papers/the-exit");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "The exit." })).toBeVisible();
  await expect(main).toContainText(`we decoded all ${survey.mints_decoded.toLocaleString("en-GB")} xStocks mints`);
  await expect(main).toContainText(`at slot ${survey.slot.toLocaleString("en-GB")}`);
  await expect(main).toContainText(`On ${survey.stale_multiplier_field} of them`);
  await expect(main).toContainText(`${survey.halted_by_issuer} were in an issuer-halted state`);
  await expect(main).toContainText(`applies ${admissions.policy_version} to ${admissions.instruments.length} captured instruments`);

  const shortfall = main.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Instrument" }) });
  for (const instrument of depth.instruments) {
    const atThousand = instrument.points.find((point: { size_usdc: number }) => point.size_usdc === 1000);
    const row = shortfall.getByRole("row").filter({ has: page.getByRole("cell", { name: instrument.symbol, exact: true }) });
    if (instrument.points[0].availability !== "available") {
      await expect(row).toHaveCount(0);
      continue;
    }
    await expect(row.getByRole("cell").nth(1)).toHaveText(atThousand.shortfall_bps.toLocaleString("en-GB"));
  }

  for (const step of freeze.steps.filter((candidate: { signature?: string }) => candidate.signature)) {
    await expect(main.getByRole("link", { name: step.signature.slice(0, 8), exact: true })).toHaveAttribute("href", `https://explorer.solana.com/tx/${step.signature}?cluster=devnet`);
  }
});

test("the public narrative and Key pages keep their claims bounded", async ({ page }) => {
  await page.goto("/docs/how-it-works");
  await expect(page.getByRole("heading", { level: 1, name: "How it works" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("The basket is a mechanism.");
  // Each section answers one question a reader asks, in the reader's words.
  await expect(page.getByRole("article").getByRole("heading", { level: 2 })).toHaveText([
    "What do I actually hold when I buy a tokenized stock?",
    "What can the issuer still do to my token?",
    "Why is a bundle of tokens not an ETF?",
    "How does a Strike turn constituents into shares?",
    "What happens when I Melt, and what if an issuer freezes one constituent?",
    "Who is allowed to Strike and Melt?",
    "Does the Hall ever need a price?",
  ]);

  await page.goto("/docs/the-key");
  await expect(page.getByRole("heading", { level: 1, name: "The Key" })).toBeVisible();
  // Read live from the fixture devnet, which lays the programdata out with an
  // authority present: the state comes from those bytes, not from the page.
  await expect(page.getByRole("main")).toContainText("The Key is still in hand.");
  await expect(page.getByText("Devnet Hall. Key still in hand.", { exact: true })).toBeVisible();
  await expect(page.getByLabel(new PublicKey(Buffer.alloc(32, 7)).toBase58())).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Observed at slot 455,000,000");
  await expect(page.getByText("The melt always works. Delivery is each issuer's.", { exact: true })).toBeVisible();
  // The fact and the link name one program: the register Hall the product reads.
  await expect(page.getByLabel("GB1hX1FXQcAUWU23Ji6RtvhTzCKz84ScUsBeD7CqQnjE")).toBeVisible();
  await expect(page.getByRole("link", { name: "Inspect the program" })).toHaveAttribute("href", /GB1hX1FXQcAUWU23Ji6RtvhTzCKz84ScUsBeD7CqQnjE\?cluster=devnet$/);
});

test("How it works lets a reader run the Hall's arithmetic, a frozen leg and any assay record", async ({ page }) => {
  await page.goto("/docs/how-it-works");

  // The bench starts at the specification's rounding vector: 7 shares cost 7
  // atoms and a straight Melt credits 6, as shared/spec/recipe/vectors.json says.
  const bench = page.getByRole("figure", { name: "Strike and Melt bench" });
  // A value set before hydration stays in the DOM while React's state does
  // not, and refilling the same value fires no change. Each retry moves
  // through another value first, so a live page always sees a change.
  await expect(async () => {
    await bench.getByRole("slider").fill("6");
    await bench.getByRole("slider").fill("7");
    await expect(bench.getByLabel("The arithmetic for this many shares")).toContainText("Strike pays  7 atoms", { timeout: 1000 });
  }).toPass();
  await expect(bench.getByLabel("The arithmetic for this many shares")).toContainText("Melt credits 6 atoms");
  await expect(bench.getByText(/you pay 7, your Claim gets 6\. 1 atom stays with the Hall/)).toBeVisible();
  await bench.getByRole("button", { name: "Strike 7" }).click();
  await expect(bench.getByText("1,000,010", { exact: true })).toBeVisible();

  // One frozen leg: the obvious redemption reverts everything; the Hall delivers the rest.
  const freeze = page.getByRole("figure", { name: "One frozen leg, two exits" });
  await expect(freeze.getByRole("checkbox", { name: "NVDAx" })).toBeChecked();
  await expect(freeze.getByRole("region", { name: "The obvious redemption" }).getByText("Reverts", { exact: true })).toHaveCount(3);
  await freeze.getByRole("button", { name: "Melt 10 shares" }).click();
  await freeze.getByRole("button", { name: "Withdraw each leg" }).click();
  await expect(freeze.getByText(/^2 of 3 legs delivered\./)).toBeVisible();
  await freeze.getByRole("checkbox", { name: "NVDAx" }).uncheck();
  await expect(freeze.getByRole("region", { name: "The obvious redemption" }).getByText("Reverts", { exact: true })).toHaveCount(0);

  // Any captured instrument's record, as the policy engine wrote it.
  const explorer = page.getByRole("figure", { name: "Read any captured instrument" });
  await explorer.getByRole("combobox").selectOption("IREN");
  await expect(explorer.getByLabel("IREN assay record")).toContainText("decision  BLOCK");
  await expect(explorer.getByText(/realises a rate 254 basis points worse/)).toBeVisible();
});

test("The Key shows the loader's record, its upgrade rule, and a move between versions", async ({ page }) => {
  await page.goto("/docs/the-key", { waitUntil: "networkidle" });

  // The fixture devnet lays the programdata out with a deployment slot of
  // 450,000,000 and an authority present; the command block reads both.
  const check = page.getByRole("figure", { name: "Check the Key yourself" }).getByLabel("What the command reports");
  await expect(check).toContainText("solana program show GB1hX1FXQcAUWU23Ji6RtvhTzCKz84ScUsBeD7CqQnjE --url devnet");
  await expect(check).toContainText(`Authority: ${new PublicKey(Buffer.alloc(32, 7)).toBase58()}`);
  await expect(check).toContainText("Last Deployed In Slot: 450000000");

  const upgrade = page.getByRole("figure", { name: "Who can change the Hall" });
  const decision = upgrade.getByLabel("The loader's decision");
  await expect(decision).toContainText("REFUSED");
  await upgrade.getByRole("radio", { name: /The upgrade authority/ }).check();
  await expect(decision).toContainText("ACCEPTED");
  await upgrade.getByRole("checkbox", { name: "Thrown away (authority set to none)" }).check();
  await expect(decision).toContainText("REFUSED");
  await expect(upgrade.getByText(/Its code can no longer change\./)).toBeVisible();

  const versions = page.getByRole("figure", { name: "Leaving one Hall version for another" });
  for (const next of ["melt them on version 1", "withdraw each leg", "strike on version 2"]) {
    await versions.getByRole("button", { name: `Next: ${next}` }).click();
  }
  await expect(versions.getByText("Version 2 Alloy shares, at version 2's Formula")).toBeVisible();
  await expect(versions.getByRole("listitem").filter({ hasText: "Strike on version 2" })).toHaveAttribute("aria-current", "step");
});

test("the docs carry one page tree, search with stated states, and a contents rail", async ({ page }) => {
  await page.goto("/docs/the-key");
  const tree = page.getByRole("navigation", { name: "Docs" });
  await expect(tree.getByRole("link", { name: "The Key" })).toHaveAttribute("aria-current", "page");
  // The thesis has its own page and is not part of the docs tree (Storm, 12 October 2026).
  await expect(tree.getByRole("link", { name: "The thesis" })).toHaveCount(0);
  await expect(tree.getByRole("link", { name: "The exit" })).toHaveAttribute("href", "/docs/papers/the-exit");
  await expect(tree.getByText("Papers", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link")).toHaveText([
    "Who can change the Hall right now?",
    "What can the holder of the Key do, and what can't they?",
    "What must the final Hall preserve?",
    "What does \"final\" mean, if the Hall still needs to improve?",
    "Why is the Key not thrown away today?",
  ]);

  const search = page.getByRole("searchbox", { name: "Search the docs" });
  await search.fill("melt");
  await expect(page.getByRole("list", { name: "Search results" }).getByRole("link").first()).toBeVisible();
  await search.fill("zzqqxx");
  await expect(page.getByText('Nothing in the docs matches "zzqqxx". Try a shorter word.')).toBeVisible();
  await search.press("Escape");
  await expect(tree.getByRole("link", { name: "How it works" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/how-it-works");
  const toggle = page.getByRole("button", { name: "Docs pages" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(tree.getByRole("link", { name: "The Key" })).toBeHidden();
  await toggle.click();
  await tree.getByRole("link", { name: "The Key" }).click();
  await expect(page).toHaveURL(/\/docs\/the-key$/);
});

test("sign in distinguishes an account from its wallet while setup is unavailable", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByRole("heading", { level: 1, name: "Your account, your wallet." })).toBeVisible();
  await expect(page.getByText("Account sign-in is unavailable while its database and provider are being configured.", { exact: true })).toBeVisible();
  await expect(page.getByText("Each Allocation belongs to its signing address.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign message" })).toHaveCount(0);
  await expect(page.getByRole("main").locator("input")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("link", { name: "Open the Allocation" })).toHaveAttribute("href", "/app/allocation");
});

test("the public site publishes the terms and privacy policy used for account consent", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(footer.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy-policy");

  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible();
  await expect(page.getByText("Effective 9 October 2026", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Accounts return you to Seametry." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Wallets remain under their owners' control." })).toBeVisible();

  await page.goto("/privacy-policy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  await expect(page.getByText("Effective 9 October 2026", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Google returns account identity data." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "A linked wallet remains public." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "You may delete your account." })).toBeVisible();
});

test("the wallet state lives in the app's top bar, and connecting signs nothing", async ({ page }) => {
  await page.goto("/");
  // The public rail carries reading pages and one way into the app, never a wallet.
  await expect(page.getByRole("banner").locator("summary", { hasText: "Connect" })).toHaveCount(0);

  await page.goto("/app");
  const bar = page.getByRole("banner");
  const state = bar.locator("summary", { hasText: "Connect" });
  await expect(state).toBeVisible();
  await state.click();
  // A test browser has no wallet extension, so the no-wallet state is the one reachable here.
  await expect(bar.getByText("No signing wallet is available in this browser. On a phone, open this page in Phantom or Solflare to connect and review each action.", { exact: true })).toBeVisible();

  await page.goto("/app/allocation");
  await expect(page.getByRole("banner").locator("summary", { hasText: "Connect" })).toBeVisible();
});

test("the Allocation keeps its terms behind an info note, and the order sheet still states the fee and slippage", async ({ page }) => {
  await page.goto("/app/allocation");

  // Scoped to main: while the page streams, the loading boundary holds a
  // hidden copy of the same text outside it, and an unscoped lookup matches twice.
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Build a basket" })).toBeVisible();
  const terms = main.getByText("You remain bound by each issuer's terms of eligibility.", { exact: true });
  await expect(terms).toBeHidden();
  await main.getByLabel("About Build a basket").click();
  await expect(terms).toBeVisible();
  // components.md, Info note: what the note says about cost is never only there.
  const sheet = main.getByRole("complementary", { name: "Order sheet" });
  // Nothing is chosen yet, so the plan sits at the single-constituent rate.
  await expect(sheet.getByText("Seametry routing fee, 0.25%", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Slippage tolerance", { exact: true })).toBeVisible();
  await expect(sheet.getByText("0.50% of each swap", { exact: true })).toBeVisible();
});

test("the Allocation chooses in one step and buys in the next, the order sheet beside both", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/allocation");
  const main = page.getByRole("main");
  const steps = main.getByRole("list", { name: "Allocation steps" });
  await expect(steps.locator("[aria-current=step]")).toHaveText("1Choose");

  const sheet = page.getByRole("complementary", { name: "Order sheet" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Direct ownership", { exact: true })).toBeVisible();
  await expect(sheet).toHaveCSS("position", "sticky");
  await expect(page.getByText(/JUPITER_API_KEY|MAINNET_RPC_URL|ALLOCATION_APPROVAL_SECRET|ALLOCATION_BLOCKED_COUNTRIES|ALLOCATION_FEE_WALLET/)).toHaveCount(0);

  // Continue waits for a choice, and the count reads selected over offered.
  const next = main.getByRole("button", { name: "Set amount" });
  await expect(next).toBeDisabled();
  await expect(main.locator("output")).toHaveText(/^0\/\d+$/);
  await expect(main.getByTestId("selection-action-bar")).toHaveCSS("position", "sticky");

  // Two lots, 250 USDC: 125 each; a two-constituent plan pays 15 basis
  // points, 0.1875 each, 0.375 in all. Down to one lot, 25 basis points.
  const lots = main.locator('[aria-label="Choose the constituents"] > ul > li input[type=checkbox]');
  await lots.nth(0).check();
  await lots.nth(1).check();
  await next.click();
  await expect(steps.locator("[aria-current=step]")).toHaveText("2Buy");
  await main.getByLabel("USDC to spend").fill("letters");
  await expect(main.getByLabel("USDC to spend")).toHaveValue("");
  await main.getByLabel("USDC to spend").fill("250");
  await expect(sheet.getByText("Seametry routing fee, 0.15%", { exact: true }).locator("xpath=following-sibling::dd")).toHaveText("0.375000 USDC");
  await expect(main.getByText("AMD, 125.000000 USDC", { exact: true })).toBeVisible();

  await steps.getByRole("button", { name: "Choose" }).click();
  await lots.nth(1).uncheck();
  await expect(sheet.getByText("Seametry routing fee, 0.25%", { exact: true }).locator("xpath=following-sibling::dd")).toHaveText("0.625000 USDC");
});

test("on a phone, the Buy step carries the order sheet where signing happens", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/app/allocation");
  const main = page.getByRole("main");

  await expect(page.getByRole("complementary", { name: "Order sheet" })).toBeHidden();
  await main.locator('[aria-label="Choose the constituents"] > ul > li input[type=checkbox]').first().check();
  await main.getByRole("button", { name: "Set amount" }).click();
  await main.getByLabel("USDC to spend").fill("10");
  await expect(main.getByText("Direct ownership", { exact: true }).filter({ visible: true })).toHaveCount(1);
  await expect(main.getByRole("button", { name: "Connect wallet" }).filter({ visible: true })).toHaveCount(1);
  // The signing key appears only after a wallet connects and a purchase is previewed.
  await expect(main.getByTestId("order-sheet-inline").getByRole("button", { name: "Approve and sign" })).toHaveCount(0);
  await expect(main.getByTestId("order-sheet-inline")).toBeVisible();
});

test("the public rail carries reading pages and one way into the app", async ({ page }) => {
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  await expect(navigation.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
  await expect(navigation.getByRole("link", { name: "Thesis" })).toHaveAttribute("href", "/thesis");
  for (const product of ["Hall demo", "Allocation", "Terminal"]) {
    await expect(navigation.getByRole("link", { name: product })).toHaveCount(0);
  }
  await expect(page.getByRole("banner").getByRole("link", { name: "Open app" })).toHaveAttribute("href", "/app");
  await expect(page.getByRole("banner").getByRole("link", { name: "Seametry", exact: true })).toHaveAttribute("href", "/");
  await expect(page.getByRole("banner").getByText("Public", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use dark mode" })).toBeVisible();
});

test("every shell and the tab icon draw the house mark from public/logo.svg itself", async ({ page, request }) => {
  // A copy of the mark's paths once lived in the header and the tab icon and
  // drifted from the file, so a redrawn logo never reached the site. Every
  // place now loads the file, and the file served is the file committed.
  for (const path of ["/", "/app"] as const) {
    await page.goto(path);
    const mark = page.getByRole("link", { name: "Seametry", exact: true }).locator("img");
    await expect(mark).toHaveAttribute("src", "/logo.svg");
    expect(await mark.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/logo.svg");
  }
  const served = await request.get("/logo.svg");
  expect(served.headers()["content-type"]).toContain("image/svg+xml");
  expect(await served.text()).toBe(readFileSync("public/logo.svg", "utf8"));
});

test("narrow shells give the mark room and disclose one complete navigation register", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });

  await page.goto("/");
  await expect(page.getByRole("banner").getByText("Seametry", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  const publicMenu = page.getByRole("navigation", { name: "Mobile primary" });
  await expect(publicMenu).toBeVisible();
  await expect(publicMenu.getByRole("link")).toHaveText(["01Home", "02Docs", "03Thesis"]);
  const openApp = page.getByRole("banner").getByRole("link", { name: "Open app", exact: true });
  await expect(openApp).toBeVisible();
  // The full label must fit the narrow rail: one line, inside the header.
  const fit = await openApp.evaluate((link) => {
    const bounds = link.getBoundingClientRect();
    const rail = link.closest("header")!.getBoundingClientRect();
    const label = document.createRange();
    label.selectNodeContents(link.firstElementChild!);
    return { inside: bounds.left >= rail.left && bounds.right <= rail.right, lines: label.getClientRects().length };
  });
  expect(fit).toEqual({ inside: true, lines: 1 });
  await expect(page.getByRole("banner").getByRole("button", { name: "Use dark mode" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close navigation" })).toHaveText("");
  const publicOrder = await page.evaluate(() => ({
    menu: document.querySelector<HTMLElement>("button[aria-label='Close navigation']")?.getBoundingClientRect().left,
    mark: document.querySelector<HTMLElement>("a[aria-label='Seametry']")?.getBoundingClientRect().left,
  }));
  expect(publicOrder.menu).toBeLessThan(publicOrder.mark ?? 0);

  await page.goto("/app");
  await expect(page.getByRole("banner").getByText("Seametry", { exact: true })).toBeHidden();
  const appTabs = page.getByRole("navigation", { name: "Mobile product" });
  await expect(appTabs.getByRole("link")).toHaveCount(5);
  await expect(appTabs.getByRole("link", { name: "Baskets" })).toHaveAttribute("href", "/app/baskets");
  await expect(page.getByRole("banner").locator("summary", { hasText: "Connect" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("button", { name: "Use light mode" })).toBeVisible();
  const appOrder = await page.evaluate(() => ({
    wallet: document.querySelector<HTMLElement>("#app-wallet")?.getBoundingClientRect().left,
    theme: document.querySelector<HTMLElement>("[data-testid='app-header-theme'] button")?.getBoundingClientRect().left,
  }));
  expect(appOrder.wallet).toBeLessThan(appOrder.theme ?? 0);
  await page.locator("#app-wallet").click();
  const panel = page.getByTestId("wallet-state").locator("div").first();
  const bounds = await panel.evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(360);
  await page.goto("/");
  await expect(page.getByTestId("change-register").getByTestId("mechanism-plate")).toHaveCount(4);
  // The press drawing and its controls stay inside a 360px screen.
  const pressBounds = await page.getByRole("figure", { name: "The Hall's press" }).evaluate((element) => {
    const parts = [element, ...element.querySelectorAll("svg, button, label")].map((child) => child.getBoundingClientRect());
    return parts.every((box) => box.left >= 0 && box.right <= window.innerWidth + 0.5);
  });
  expect(pressBounds).toBe(true);
  const instrumentHeading = await page.locator("section").filter({ hasText: "The instrument, opened" }).evaluate((element) => {
    const title = element.querySelector("h2")?.getBoundingClientRect();
    const question = element.querySelector("header p")?.getBoundingClientRect();
    return { titleBottom: title?.bottom ?? 0, questionTop: question?.top ?? 0 };
  });
  expect(instrumentHeading.questionTop).toBeGreaterThanOrEqual(instrumentHeading.titleBottom);
});

test("each mechanism plate title stays on one line at desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const titles = await page.getByTestId("mechanism-plate").locator("h3").evaluateAll((headings) =>
    headings.map((heading) => {
      const style = getComputedStyle(heading);
      return { text: heading.textContent, lines: Math.round(heading.getBoundingClientRect().height / Number.parseFloat(style.lineHeight)) };
    }),
  );
  expect(titles).toHaveLength(4);
  for (const title of titles) expect(title.lines, title.text ?? "").toBe(1);
});

test("each mechanism plate draws one touchable object inside its frame", async ({ page }) => {
  await page.goto("/");
  const plates = await page.getByTestId("mechanism-plate").evaluateAll((articles) =>
    articles.map((article) => {
      const drawing = article.querySelector("svg") as SVGSVGElement;
      const frame = drawing.viewBox.baseVal;
      const ink = drawing.getBBox();
      return {
        title: article.querySelector("h3")?.textContent,
        solids: drawing.querySelectorAll("[data-solid]").length,
        inside: ink.x >= frame.x && ink.y >= frame.y && ink.x + ink.width <= frame.x + frame.width && ink.y + ink.height <= frame.y + frame.height,
      };
    }),
  );
  expect(plates).toHaveLength(4);
  for (const plate of plates) expect(plate, plate.title ?? "").toMatchObject({ solids: 1, inside: true });
});

test("desktop rails share the page content edge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const publicRail = page.getByRole("banner");
  const publicRailChrome = await publicRail.evaluate((element) => {
    const style = getComputedStyle(element);
    return { paddingInline: style.paddingInline, borderTopWidth: style.borderTopWidth };
  });
  expect(publicRailChrome).toEqual({ paddingInline: "0px", borderTopWidth: "0px" });
  const active = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home" });
  const activeTreatment = await active.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--sm-accent-touchText)";
    document.body.append(probe);
    const result = { color: getComputedStyle(element).color, expected: getComputedStyle(probe).color, rule: getComputedStyle(element, "::after").content };
    probe.remove();
    return result;
  });
  expect(activeTreatment.color).toBe(activeTreatment.expected);
  expect(activeTreatment.rule).toBe("none");
  await expect(page.getByRole("figure", { name: "The Hall's press" }).locator("figcaption")).toBeVisible();
  await page.goto("/app");
  const edges = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>("[data-testid='app-header-inner']");
    const main = document.querySelector<HTMLElement>("main");
    if (!header || !main) return null;
    const headerBox = header.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    return { headerLeft: headerBox.left, headerRight: headerBox.right, mainLeft: mainBox.left, mainRight: mainBox.right };
  });
  expect(edges).not.toBeNull();
  expect(edges?.headerLeft).toBe(edges?.mainLeft);
  expect(edges?.headerRight).toBe(edges?.mainRight);
});

test("the landing's press strikes the Formula, refuses Strike on a frozen leg, and still melts", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const press = page.getByRole("figure", { name: "The Hall's press" });
  const readout = press.getByRole("status");
  // The touched figure stops its idle tour, so only the reader's moves run.
  await expect(async () => {
    await press.getByRole("button", { name: "Strike 1 share" }).click();
    await expect(readout).toContainText("Struck 1 share. Paid 2 AAPLx, 1.5 NVDAx, 0.25 TSLAx. No price was read.", { timeout: 6000 });
  }).toPass({ timeout: 20_000 });
  await press.getByRole("checkbox", { name: "Issuer freezes NVDAx" }).check();
  await press.getByRole("button", { name: "Strike 1 share" }).click();
  await expect(readout).toContainText("Strike refused. The issuer froze the Hall's NVDAx account");
  await press.getByRole("button", { name: "Melt 1 share" }).click();
  await expect(readout).toContainText("Withdrew AAPLx and TSLAx; NVDAx stays filed as a Claim", { timeout: 10_000 });
});

test("the app keeps its reading pages in the status bar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await expect(page.locator("aside")).toHaveCount(0);
  const reading = page.getByRole("contentinfo").getByRole("navigation", { name: "Reading" });
  await expect(reading.getByRole("link")).toHaveText(["How it works", "The Key"]);
});

test("the app header connects a wallet and keeps the mode control beside it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");

  const login = page.getByTestId("app-header-actions").locator("summary", { hasText: "Connect" });
  await expect(login).toBeVisible();
  const treatment = await login.evaluate((summary) => {
    const probe = document.createElement("span");
    probe.style.background = "var(--sm-accent-touch)";
    document.body.append(probe);
    const touch = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const label = getComputedStyle(summary.querySelector("span") as HTMLElement);
    const theme = document.querySelector("[data-testid='app-header-theme'] button") as HTMLElement;
    return {
      login: getComputedStyle(summary).backgroundColor === touch,
      evenLabel: label.paddingLeft === label.paddingRight,
      theme: getComputedStyle(theme).backgroundColor === touch,
    };
  });
  expect(treatment).toEqual({ login: true, evenLabel: true, theme: false });
  await expect(login.locator(":scope > span").last().locator("svg")).toHaveCount(1);
  await expect(page.getByRole("banner").getByRole("navigation", { name: "Product" }).getByRole("link")).toHaveText([
    "Overview",
    "Holdings",
    "Baskets",
    "Build a basket",
    "Alloys",
    "Sponsor",
    "Instruments",
  ]);
});

test("the docs render compiled MDX with its contents, and search answers from those pages", async ({ page, request }) => {
  await page.goto("/docs");
  await expect(page.getByRole("heading", { level: 1, name: "Docs" })).toBeVisible();
  const contents = page.getByRole("navigation", { name: "On this page" });
  await expect(contents.getByRole("link", { name: "Where to start" })).toHaveAttribute("href", "#where-to-start");
  await expect(page.getByRole("main").getByRole("article").getByRole("link", { name: "The Key" })).toHaveAttribute("href", "/docs/the-key");
  const found = await request.get("/api/docs/search?query=evidence");
  expect(found.status()).toBe(200);
  const results = (await found.json()) as { url: string }[];
  expect(results.some((result) => result.url.startsWith("/docs"))).toBe(true);
  expect((await request.get("/docs/no-such-page")).status()).toBe(404);
});

test("Baskets and Build a basket are sibling shell routes, never a switch the page draws", async ({ page }) => {
  for (const [path, current] of [
    ["/app/baskets", "Baskets"],
    ["/app/baskets/prime-seven", "Baskets"],
    ["/app/baskets/build", "Build a basket"],
    ["/app/allocation", "Build a basket"],
  ] as const) {
    await page.goto(path);
    const product = page.getByRole("banner").getByRole("navigation", { name: "Product" });
    await expect(product.locator("a[aria-current='page']"), path).toHaveText(current);
    await expect(page.getByRole("navigation", { name: "Basket view" })).toHaveCount(0);
  }
});

test("every app page names its network, and the top bar and mobile register share one route list", async ({ page }) => {
  for (const [path, network] of [
    ["/app", "Mainnet evidence"],
    ["/app/positions", "Mainnet"],
    ["/app/baskets", "Mainnet"],
    ["/app/baskets/build", "Mainnet"],
    ["/app/compose", "Devnet"],
    ["/app/alloys/storm", "Devnet"],
    ["/app/instruments", "Mainnet evidence"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("main").getByText(network, { exact: true }).first(), `${path} names ${network}`).toBeVisible();
  }

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/app/alloys/storm");
  const mobile = page.getByRole("navigation", { name: "Mobile product" });
  await expect(mobile.getByRole("link", { name: "Alloys" })).toHaveAttribute("aria-current", "page");
});

test("the app shell marks only the current tab with an icon, and keeps one global wallet control", async ({ page }) => {
  await page.goto("/app/compose");

  const product = page.getByRole("navigation", { name: "Product" });
  await expect(product.locator("svg")).toHaveCount(1);
  await expect(product.locator("a[aria-current='page'] svg")).toHaveCount(1);
  await page.goto("/app");

  const reading = page.getByRole("navigation", { name: "Reading" });
  await expect(reading.locator("svg")).toHaveCount(2);

  for (const path of ["/app/baskets/build", "/app/compose"]) {
    await page.goto(path);
    await expect(page.getByRole("banner").locator("summary", { hasText: "Connect" })).toHaveCount(1);
  }
});

test("the desk cards let their content lead without decorative icons", async ({ page }) => {
  await page.goto("/app");

  for (const name of ["The Alloy register", "Baskets", "Demo", "Instruments"]) {
    const card = page.getByRole("heading", { level: 2, name }).locator("..");
    await expect(card.locator("svg")).toHaveCount(0);
  }
});

test("the desk reads as one numbered institutional folio", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByTestId("desk-folio").locator("section").getByText(/^0[1-3] \/ /)).toHaveText([
    "01 / Alloy",
    "02 / Allocation",
    "03 / Assay",
  ]);
  const lead = page.getByTestId("desk-folio").locator("section").first();
  await expect(lead.locator("svg [data-solid]")).toHaveCount(1);
  // The fixture Gateway serves one Alloy; the lead reads the register, not a fixture of its own.
  await expect(lead.getByRole("heading", { level: 2 })).toHaveText("The Alloy register");
  await expect(lead.locator("figure")).toContainText(/(^|\D)1\s*Alloy(?!s)/);
  await expect(lead.locator("figure")).toContainText("Seametry Gateway, devnet Hall");
});

// foundations.md, Ink: the ink icon cell on secondary actions was removed
// (Storm, 12 October 2026); a secondary glyph takes its label's colour.
test("secondary action glyphs carry no ink block, primary actions keep their pressed-green cell", async ({ page }) => {
  await page.goto("/app");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Resolves any CSS colour value as the browser computes it.
  const colour = (value: string) => page.evaluate((css) => {
    const probe = document.createElement("span");
    probe.style.background = css;
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, value);
  const cellOf = (name: string) =>
    page.getByRole("link", { name }).locator(":scope > span").last().evaluate((cell) => ({
      background: getComputedStyle(cell).backgroundColor,
      color: getComputedStyle(cell).color,
      label: getComputedStyle(cell.parentElement!).color,
    }));
  const secondary = await cellOf("Open the assay");
  expect(secondary.background).not.toBe(await colour("var(--sm-surface-inverse)"));
  expect(secondary.background).toBe(await colour("transparent"));
  expect(secondary.color).toBe(secondary.label);
  expect((await cellOf("Open the register")).background).toBe(await colour("var(--sm-accent-touchPressed)"));
});

test("no page scrolls sideways on a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  for (const path of ["/", "/app", "/app/baskets", "/app/baskets/build", "/app/allocation", "/app/alloys", "/app/alloys/storm", "/app/instruments", "/docs", "/docs/how-it-works", "/docs/papers/the-exit", "/sign-in", "/docs/the-key"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    // scrollWidth, not a visible scrollbar: the root hides horizontal overflow,
    // which stops a scrollbar but not a finger dragging the page sideways.
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `${path} is ${width}px wide`).toBe(320);
  }
});

test("no docs content is clipped at the right edge of a 320px phone", async ({ page }) => {
  // scrollWidth cannot see this: the root hides horizontal overflow, so a
  // grid item wider than the screen is cut off without the page widening.
  await page.setViewportSize({ width: 320, height: 780 });
  for (const path of ["/docs", "/docs/how-it-works", "/docs/the-key"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const overhang = await page.evaluate(() =>
      [...document.querySelectorAll("article, article > div > *, figure")]
        .map((element) => ({ tag: element.tagName, label: element.getAttribute("aria-label") ?? "", right: Math.round(element.getBoundingClientRect().right) }))
        .filter((box) => box.right > window.innerWidth),
    );
    expect(overhang, `${path} has content past the screen`).toEqual([]);
  }
});

test("links shared before the move still arrive", async ({ page }) => {
  for (const [from, to] of [
    ["/allocation", "/app/allocation"],
    // The clickable demo was retired; both its addresses land on the live register.
    ["/hall-demo", "/app/alloys"],
    ["/app/hall", "/app/alloys"],
    ["/terminal", "/app/instruments"],
    ["/terminal/alloys", "/app/alloys"],
    ["/terminal/alloys/storm", "/app/alloys/storm"],
    // The explanation pages moved into the docs on 12 October 2026.
    ["/how-it-works", "/docs/how-it-works"],
    ["/the-key", "/docs/the-key"],
    ["/papers/the-exit", "/docs/papers/the-exit"],
  ] as const) {
    await page.goto(from);
    await expect(page, `${from} arrives at ${to}`).toHaveURL(to);
  }
});

test("public opens light, product opens dark, and a stored choice is honoured", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  // A dark system preference does not override the default.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Use dark mode" })).toBeVisible();

  await page.goto("/app");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Use light mode" }).click();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await context.close();
});

test("an unknown public route returns a useful route index", async ({ page }) => {
  await page.goto("/a-route-that-is-not-registered");

  await expect(page.getByRole("heading", { level: 1, name: "That route is not in the register." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the overview" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("main").getByRole("link", { name: "Open the app" })).toHaveAttribute("href", "/app");
});
