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
  await expect(page.getByRole("main").getByRole("link", { name: "Open app" })).toHaveAttribute("href", "/app");

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
  await expect(page.getByRole("banner").locator("summary", { hasText: "Log in" })).toHaveCount(0);

  await page.goto("/app");
  const bar = page.getByRole("banner");
  const state = bar.locator("summary", { hasText: "Log in" });
  await expect(state).toBeVisible();
  await state.click();
  // A test browser has no wallet extension, so the no-wallet state is the one reachable here.
  await expect(bar.getByText("No wallet was detected in this browser. Open the site in a browser with a Solana wallet extension, or use your wallet's browser on a phone.", { exact: true })).toBeVisible();

  await page.goto("/app/allocation");
  await expect(page.getByRole("banner").locator("summary", { hasText: "Log in" })).toBeVisible();
});

test("the Allocation explains direct ownership before introducing its execution terms", async ({ page }) => {
  await page.goto("/app/allocation");

  await expect(page.getByRole("heading", { level: 1, name: "Build a basket" })).toBeVisible();
  await expect(page.getByText("Each token settles directly into your wallet; nothing is pooled and no basket token is issued.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Choose the constituents" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Set the basket amount" })).toBeVisible();
});

test("the Allocation keeps the plan beside the work and hides deployment plumbing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/allocation");

  const amount = page.getByRole("heading", { level: 2, name: "Set the basket amount" });
  const constituents = page.getByRole("heading", { level: 2, name: "Choose the constituents" });
  expect(
    await amount.evaluate((amountHeading, constituentHeading) =>
      Boolean(amountHeading.compareDocumentPosition(constituentHeading as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
      await constituents.elementHandle(),
    ),
  ).toBe(true);

  const sheet = page.getByRole("complementary", { name: "Order sheet" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Direct ownership", { exact: true })).toBeVisible();
  await expect(sheet.getByText("One swap per constituent", { exact: true })).toBeVisible();
  await expect(page.getByText(/JUPITER_API_KEY|MAINNET_RPC_URL|ALLOCATION_APPROVAL_SECRET|ALLOCATION_BLOCKED_COUNTRIES/)).toHaveCount(0);
});

test("the Allocation order sheet becomes an accessible mobile dialog", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/app/allocation");

  await expect(page.getByRole("complementary", { name: "Order sheet" })).toBeHidden();
  await page.getByRole("button", { name: "Review order sheet" }).click();
  const dialog = page.getByRole("dialog", { name: "Order sheet" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Direct ownership", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close order sheet" }).click();
  await expect(dialog).toBeHidden();
});

test("the public rail carries reading pages and one way into the app", async ({ page }) => {
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
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

test("every shell uses the registered three-part house mark", async ({ page }) => {
  for (const path of ["/", "/app"] as const) {
    await page.goto(path);
    const mark = page.getByRole("link", { name: "Seametry", exact: true }).locator("svg");
    await expect(mark).toHaveAttribute("viewBox", "0 0 314 235");
    await expect(mark.locator("path")).toHaveCount(3);
  }
});

test("narrow shells give the mark room and disclose one complete navigation register", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });

  await page.goto("/");
  await expect(page.getByRole("banner").getByText("Seametry", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  const publicMenu = page.getByRole("navigation", { name: "Mobile primary" });
  await expect(publicMenu).toBeVisible();
  await expect(publicMenu.getByRole("link")).toHaveText(["01Home", "02How it works", "03The Key"]);
  await expect(page.getByRole("banner").getByRole("link", { name: "App", exact: true })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("button", { name: "Use dark mode" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close navigation" })).toHaveText("");
  const publicOrder = await page.evaluate(() => ({
    menu: document.querySelector<HTMLElement>("button[aria-label='Close navigation']")?.getBoundingClientRect().left,
    mark: document.querySelector<HTMLElement>("a[aria-label='Seametry']")?.getBoundingClientRect().left,
  }));
  expect(publicOrder.menu).toBeLessThan(publicOrder.mark ?? 0);

  await page.goto("/app");
  await expect(page.getByRole("banner").getByText("Seametry", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Open product navigation" }).click();
  const appMenu = page.getByRole("navigation", { name: "Mobile product" });
  await expect(appMenu).toBeVisible();
  await expect(page.getByRole("banner").locator("summary", { hasText: "Log in" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("button", { name: "Use dark mode" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close product navigation" })).toHaveText("");
  const appOrder = await page.evaluate(() => ({
    wallet: document.querySelector<HTMLElement>("summary")?.getBoundingClientRect().left,
    theme: document.querySelector<HTMLElement>("button[aria-label='Use dark mode']")?.getBoundingClientRect().left,
    menu: document.querySelector<HTMLElement>("button[aria-label='Close product navigation']")?.getBoundingClientRect().left,
  }));
  expect(appOrder.wallet).toBeLessThan(appOrder.theme ?? 0);
  expect(appOrder.theme).toBeLessThan(appOrder.menu ?? 0);
  await expect(page.getByRole("navigation", { name: "Product sections" })).toHaveCount(0);
  await expect(appMenu.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(appMenu.getByRole("link", { name: "The Key" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByTestId("change-register").getByTestId("mechanism-plate")).toHaveCount(4);
  const mechanismGeometry = await page.getByTestId("open-ap-mechanism").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const children = Array.from(element.children).map((child) => child.getBoundingClientRect());
    return {
      contained: children.every((child) => child.left >= bounds.left && child.right <= bounds.right),
      stacked: children.every((child, index) => index === 0 || child.top >= children[index - 1].bottom),
    };
  });
  expect(mechanismGeometry).toEqual({ contained: true, stacked: true });
  const instrumentHeading = await page.locator("section").filter({ hasText: "The instrument, opened" }).evaluate((element) => {
    const title = element.querySelector("h2")?.getBoundingClientRect();
    const question = element.querySelector("header p")?.getBoundingClientRect();
    return { titleBottom: title?.bottom ?? 0, questionTop: question?.top ?? 0 };
  });
  expect(instrumentHeading.questionTop).toBeGreaterThanOrEqual(instrumentHeading.titleBottom);
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
  const mechanismFooter = page.getByTestId("open-ap-field").locator("figcaption");
  await expect(mechanismFooter).toBeVisible();
  expect(await mechanismFooter.evaluate((element) => getComputedStyle(element).maxWidth)).toBe("none");
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

test("the Open AP field keeps its inset and the app keeps its reading pages in the status bar", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/");
  const fieldPadding = await page.getByTestId("open-ap-field").evaluate((element) => {
    const style = getComputedStyle(element);
    return { left: style.paddingLeft, right: style.paddingRight };
  });
  expect(fieldPadding.left).toBe(fieldPadding.right);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await expect(page.locator("aside")).toHaveCount(0);
  const reading = page.getByRole("contentinfo").getByRole("navigation", { name: "Reading" });
  await expect(reading.getByRole("link")).toHaveText(["How it works", "The Key"]);
});

test("the app header logs in with a route action and keeps the mode control beside it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");

  const login = page.getByTestId("app-header-actions").locator("summary", { hasText: "Log in" });
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
  expect(treatment).toEqual({ login: true, evenLabel: true, theme: true });
  await expect(login.locator(":scope > span").last().locator("svg")).toHaveCount(1);
  await expect(page.getByRole("banner").getByRole("navigation", { name: "Product" }).getByRole("link")).toHaveText([
    "Overview",
    "Build a basket",
    "Alloy No. 1",
    "Alloys",
    "Demo",
    "Instruments",
  ]);
});

test("the Hall demonstration lives in the app, marked devnet", async ({ page }) => {
  await page.goto("/app/hall");

  await expect(page.getByRole("navigation", { name: "Product" }).getByRole("link", { name: "Demo" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Demo" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Devnet", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inspect live Alloys" })).toHaveAttribute("href", "/app/alloys");
});

test("every app page names its network, and the top bar and mobile register share one route list", async ({ page }) => {
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
  await page.getByRole("button", { name: "Open product navigation" }).click();
  const mobile = page.getByRole("navigation", { name: "Mobile product" });
  await expect(mobile.getByRole("link", { name: "Alloy No. 1" })).toHaveAttribute("aria-current", "page");
});

test("the app shell marks only the current tab with an icon, and keeps one global wallet control", async ({ page }) => {
  await page.goto("/app/hall");

  const product = page.getByRole("navigation", { name: "Product" });
  await expect(product.locator("svg")).toHaveCount(1);
  await expect(product.locator("a[aria-current='page'] svg")).toHaveCount(1);
  await page.goto("/app");

  const reading = page.getByRole("navigation", { name: "Reading" });
  await expect(reading.locator("svg")).toHaveCount(2);

  for (const path of ["/app/allocation", "/app/hall"]) {
    await page.goto(path);
    await expect(page.getByRole("main").getByRole("button", { name: /Connect / })).toHaveCount(0);
    await expect(page.getByRole("banner").locator("summary", { hasText: "Log in" })).toHaveCount(1);
  }
});

test("the desk cards let their content lead without decorative icons", async ({ page }) => {
  await page.goto("/app");

  for (const name of ["Alloy No. 1, STORM", "Build a basket", "Demo", "Instruments"]) {
    const card = page.getByRole("heading", { level: 2, name }).locator("..");
    await expect(card.locator("svg")).toHaveCount(0);
  }
});

test("the desk reads as one numbered institutional folio", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByTestId("desk-folio").locator("section").getByText(/^0[1-4] \/ /)).toHaveText([
    "01 / Alloy",
    "02 / Allocation",
    "03 / Hall",
    "04 / Assay",
  ]);
  await expect(page.getByTestId("desk-folio").locator("section").first().locator("svg [data-solid]")).toHaveCount(1);
});

test("secondary actions carry the ink cell, primary actions stay green", async ({ page }) => {
  await page.goto("/app");
  const ink = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.background = "var(--sm-surface-inverse)";
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  });
  const cellOf = (name: string) =>
    page.getByRole("link", { name }).locator(":scope > span").last().evaluate((cell) => getComputedStyle(cell).backgroundColor);
  expect(await cellOf("Run the demo")).toBe(ink);
  expect(await cellOf("Open Alloy No. 1")).not.toBe(ink);
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
