import { expect, test, type Page } from "@playwright/test";

// The Admin under /admin against the fixture's account authority and Gateway
// (tests/terminal-api-fixture.mjs). Who is an admin is the Gateway's answer;
// the web's only job is to show the site's plain 404 for anything else, and
// to draw its own frame, the Admin shell, only for an admitted account.

const session = (name: string) => ({ cookie: `better-auth.session_token=${name}` });

async function signIn(page: Page, name: string) {
  await page.context().addCookies([{ name: "better-auth.session_token", value: name, url: "http://localhost:3847" }]);
}

const pages = [
  { label: "Overview", href: "/admin", title: "Seametry's record" },
  { label: "Funnel", href: "/admin/funnel", title: "Funnel" },
  { label: "Sources", href: "/admin/sources", title: "Sources" },
  { label: "Wallets", href: "/admin/wallets", title: "Wallets" },
  { label: "Activity", href: "/admin/activity", title: "Activity" },
  { label: "Email opt-ins", href: "/admin/opt-ins", title: "Email opt-ins" },
];

// A route that calls notFound() is answered with Next's error shell and the
// site's not-found page rendered from the payload, as /docs/{unknown} is; a
// route that matches nothing is rendered in the HTML itself. Both are 404
// and both show the same page, which is what each half below checks.
test("signed out or with an unknown session, every Admin page redirects to sign-in and names itself, query included, as the way back", async ({ request }) => {
  for (const headers of [{}, session("forged")]) {
    for (const path of ["/admin", "/admin?from=2026-10-01&to=2026-10-20&deployment=preview", "/admin/wallets?deployment=preview", "/admin/opt-ins"]) {
      const response = await request.get(path, { headers, maxRedirects: 0 });
      const label = `${path} with ${JSON.stringify(headers)}`;
      expect([303, 307], label).toContain(response.status());
      const location = new URL(response.headers()["location"] ?? "", "http://localhost:3847");
      expect(location.pathname, label).toBe("/sign-in");
      expect(location.searchParams.get("next"), label).toBe(path);
    }
  }
});

test("a way back that is not an Admin path on this site returns to the Overview", async ({ request }) => {
  // A prefetch skips the proxy, so its path header is the caller's own.
  for (const forged of ["//evil.example/admin", "https://evil.example/admin", "/sign-in", "/administrator"]) {
    const response = await request.get("/admin/funnel", { headers: { "next-router-prefetch": "1", "x-request-path": forged }, maxRedirects: 0 });
    expect([303, 307], forged).toContain(response.status());
    const location = new URL(response.headers()["location"] ?? "", "http://localhost:3847");
    expect(location.searchParams.get("next"), forged).toBe("/admin");
  }
});

test("signed in as anyone else, every Admin page answers 404 with no redirect and nothing of the Admin", async ({ request }) => {
  for (const path of [...pages.map((entry) => entry.href), "/admin?from=2026-10-01&to=2026-10-20&deployment=preview"]) {
    const response = await request.get(path, { headers: session("fixture-member"), maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(response.headers()["location"], path).toBeUndefined();
    const html = await response.text();
    for (const absent of ["Seametry&#x27;s record", "Seametry's record", "Admin", "fixture-member-token", "Read the period", "storm@example.com"]) {
      expect(html, `${path} carries ${absent}`).not.toContain(absent);
    }
  }
});

test("a non-admin's Admin page shows the same not-found page as a missing route", async ({ page }) => {
  await page.goto("/no-such-route-in-the-register");
  const missing = await page.getByRole("heading", { level: 1 }).textContent();
  expect(missing).toBeTruthy();
  await signIn(page, "fixture-member");
  for (const path of ["/admin", "/admin/wallets"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(missing!);
    await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
  }
});

test("the Admin shell lists every Admin page, marks the current one, and names the admitted account", async ({ page }) => {
  await signIn(page, "fixture-admin");
  for (const entry of pages) {
    const response = await page.goto(entry.href);
    expect(response?.status(), entry.href).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.title);
    const rail = page.getByRole("navigation", { name: "Admin" });
    await expect(rail.getByRole("link")).toHaveText(pages.map((each) => each.label));
    await expect(rail.locator("[aria-current=page]")).toHaveText(entry.label);
  }
  await expect(page.getByText("storm@example.com", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the site" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  // The Admin is its own frame: no public footer, no House rail.
  await expect(page.locator("footer")).toHaveCount(0);

  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Sources" }).click();
  await expect(page).toHaveURL(/\/admin\/sources$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sources");
});

test("on a phone the Admin pages fold behind one button and unfold above the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "fixture-admin");
  await page.goto("/admin/funnel");
  const toggle = page.getByRole("button", { name: "Admin pages" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("navigation", { name: "Admin" })).toBeHidden();
  await toggle.click();
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Wallets" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("an admin reads every page, labelled by whose word each figure is, with no token or full address in any page", async ({ page }) => {
  await signIn(page, "fixture-admin");
  await page.goto("/admin");
  await expect(page.getByText("The reconciler last wrote a chain answer 2 min ago.", { exact: false })).toBeVisible();
  await expect(page.getByRole("figure").filter({ has: page.getByText("Volume", { exact: true }) })).toContainText("2.600000");
  await expect(page.getByRole("figure").filter({ has: page.getByText("Volume", { exact: true }) })).toContainText("Verified");
  await expect(page.getByRole("figure").filter({ has: page.getByText("Fee revenue", { exact: true }) })).toContainText("0.007800");
  await expect(page.getByRole("row", { name: /Of those, activated/ })).toContainText("2 of 2");
  const htmls = [await page.content()];

  await page.goto("/admin/funnel");
  const funnel = page.getByRole("region", { name: "Funnel" });
  await expect(funnel.getByRole("row", { name: /Review opened/ })).toContainText("Browser reported");
  await expect(funnel.getByRole("row", { name: /^Landed/ })).toContainText("Chain answered");
  await expect(page.getByRole("region", { name: "Reliability" })).toBeVisible();
  htmls.push(await page.content());

  await page.goto("/admin/sources");
  const sources = page.getByRole("region", { name: "Sources" });
  await expect(sources.getByRole("row", { name: /storm/ })).toContainText("2.200000");
  await expect(sources.getByRole("row", { name: /Unknown, none kept/ })).toContainText("0.400000");
  htmls.push(await page.content());

  await page.goto("/admin/activity");
  const activity = page.getByRole("region", { name: "Recent activity" });
  await expect(activity.locator("tr[data-source=chain]")).toContainText("Settled: landed");
  await expect(activity.locator("tr[data-source=server]")).toContainText("Seametry sent");
  await expect(activity.locator("tr[data-source=server]")).not.toContainText("Settled");
  await expect(activity.locator("tr[data-source=client]")).toContainText("Browser reported");
  htmls.push(await page.content());

  await page.goto("/admin/opt-ins");
  const optIns = page.getByRole("region", { name: "Email opt-ins" });
  await expect(optIns).toContainText("s***@g***.com");
  await expect(optIns).toContainText("Withdrawn, address erased");
  htmls.push(await page.content());

  for (const html of htmls) {
    expect(html).not.toContain("fixture-admin-token");
    expect(html).not.toContain("authorization");
  }
  expect((await page.context().cookies()).map((cookie) => cookie.name)).toEqual(["better-auth.session_token"]);
});

test("an admin's date range and deployment reach the Gateway on the page asked from, and a refused range says so and reads the default", async ({ page }) => {
  await signIn(page, "fixture-admin");
  await page.goto("/admin?from=2026-10-10&to=2026-10-19&deployment=preview");
  await expect(page.getByRole("heading", { level: 1 }).locator("..")).toContainText("2026-10-10 00:00 UTC to 2026-10-20 00:00 UTC, preview");
  await expect(page.getByLabel("From")).toHaveValue("2026-10-10");
  await expect(page.getByLabel("To, inclusive")).toHaveValue("2026-10-19");

  await page.goto("/admin/sources");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To, inclusive").fill("2026-10-14");
  await page.getByRole("button", { name: "Read the period" }).click();
  await expect(page).toHaveURL(/\/admin\/sources\?from=2026-10-12&to=2026-10-14/);
  await expect(page.getByRole("heading", { level: 1 }).locator("..")).toContainText("2026-10-12 00:00 UTC to 2026-10-15 00:00 UTC");

  for (const path of ["/admin", "/admin/activity"]) {
    await page.goto(`${path}?from=2026-10-19&to=2026-10-01`);
    const refused = page.getByRole("status").filter({ hasText: "The range was refused" });
    await expect(refused, path).toContainText("is not before");
    await expect(refused, path).toContainText("The last 30 days are shown instead.");
  }
});

test("an admin with an empty record sees each page say what is absent", async ({ page }) => {
  await signIn(page, "fixture-admin-empty");
  await page.goto("/admin");
  await expect(page.getByText("The reconciler has not written a chain answer yet.", { exact: false })).toBeVisible();
  // With no reconciler answer, a chain-measured figure is unobserved, not verified.
  for (const label of ["Volume", "Fee revenue", "Landed legs"]) {
    const figure = page.getByRole("figure").filter({ has: page.getByText(label, { exact: true }) });
    await expect(figure).toContainText("No observation yet");
    await expect(figure).not.toContainText("Verified");
  }
  const absent: [string, string[]][] = [
    ["/admin/funnel", ["No quote was prepared in this period.", "No leg was sent in this period."]],
    ["/admin/sources", ["No wallet was seen or traded in this period."]],
    ["/admin/wallets", ["No wallet has asked for a quote in this deployment."]],
    ["/admin/activity", ["Nothing has been recorded before the end of this period."]],
    ["/admin/opt-ins", ["No email consent was given in this period."]],
  ];
  for (const [path, sentences] of absent) {
    await page.goto(path);
    for (const sentence of sentences) await expect(page.getByText(sentence), path).toBeVisible();
  }
});

test("an admin whose reads the Gateway cannot answer sees each page name its read unavailable, inside the frame", async ({ page }) => {
  await signIn(page, "fixture-admin-degraded");
  await page.goto("/admin");
  await expect(page.getByRole("figure").filter({ has: page.getByText("Volume", { exact: true }) })).toContainText("2.600000");
  for (const [path, region] of [["/admin/sources", "Sources"], ["/admin/wallets", "Wallets"], ["/admin/activity", "Recent activity"], ["/admin/opt-ins", "Email opt-ins"]]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole("region", { name: region })).toContainText("answered 503");
    await expect(page.getByRole("region", { name: region })).toContainText("Nothing from this read is shown.");
    await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();
  }
});

test("the wallet list pages by the Gateway's cursor and says how many wallets there are in all", async ({ page }) => {
  await signIn(page, "fixture-admin");
  await page.goto("/admin/wallets?deployment=production");
  const wallets = page.getByRole("region", { name: "Wallets" });
  await expect(wallets.getByText("1 of 2 wallets, newest first seen first")).toBeVisible();
  await expect(wallets.getByRole("row", { name: /FFyr/ })).toBeVisible();
  await wallets.getByRole("link", { name: "Older wallets" }).click();
  await expect(page).toHaveURL(/\/admin\/wallets\?/);
  await expect(page).toHaveURL(/wallets=fixture-older-wallets/);
  await expect(page).toHaveURL(/deployment=production/);
  await expect(wallets.getByRole("row", { name: /9WzD/ })).toBeVisible();
  await expect(wallets.getByRole("row", { name: /FFyr/ })).toHaveCount(0);
  await expect(wallets.getByRole("link", { name: "Older wallets" })).toHaveCount(0);
  await expect(wallets.getByRole("link", { name: "Newest wallets" })).toBeVisible();
});

test("a wallet cursor the Gateway refuses shows the wallet list unavailable, and the frame still reads", async ({ page }) => {
  await signIn(page, "fixture-admin");
  const response = await page.goto("/admin/wallets?wallets=forged");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("region", { name: "Wallets" }).getByText("The Gateway answered 400 for wallets.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();
});
