import { expect, test, type Page } from "@playwright/test";

// The Admin at /admin against the fixture's account authority and Gateway
// (tests/terminal-api-fixture.mjs). Who is an admin is the Gateway's answer;
// the page's only job is to show the site's plain 404 for anything else.

const session = (name: string) => ({ cookie: `better-auth.session_token=${name}` });

async function signIn(page: Page, name: string) {
  await page.context().addCookies([{ name: "better-auth.session_token", value: name, url: "http://localhost:3847" }]);
}

// A route that calls notFound() is answered with Next's error shell and the
// site's not-found page rendered from the payload, as /docs/{unknown} is; a
// route that matches nothing is rendered in the HTML itself. Both are 404
// and both show the same page, which is what each half below checks.
test("signed out, signed in as anyone else, or with an unknown session, /admin answers 404 with no redirect and nothing of the Admin", async ({ request }) => {
  for (const headers of [{}, session("fixture-member"), session("forged")]) {
    for (const path of ["/admin", "/admin?from=2026-10-01&to=2026-10-20&deployment=preview"]) {
      const response = await request.get(path, { headers, maxRedirects: 0 });
      const label = `${path} with ${JSON.stringify(headers)}`;
      expect(response.status(), label).toBe(404);
      expect(response.headers()["location"], label).toBeUndefined();
      const html = await response.text();
      for (const absent of ["Seametry&#x27;s record", "Seametry's record", "Admin", "fixture-member-token", "Read the period"]) {
        expect(html, `${label} carries ${absent}`).not.toContain(absent);
      }
    }
  }
});

test("a non-admin's /admin shows the same not-found page as a missing route", async ({ page }) => {
  await page.goto("/no-such-route-in-the-register");
  const missing = await page.getByRole("heading", { level: 1 }).textContent();
  expect(missing).toBeTruthy();
  for (const name of [undefined, "fixture-member"]) {
    if (name) await signIn(page, name);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(missing!);
    await expect(page.getByText("Seametry's record")).toHaveCount(0);
  }
});

test("an admin reads every section, labelled by whose word each figure is, with no token or full address in the page", async ({ page }) => {
  await signIn(page, "fixture-admin");
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Seametry's record");
  await expect(page.getByText("The reconciler last wrote a chain answer 2 min ago.", { exact: false })).toBeVisible();

  await expect(page.getByRole("figure").filter({ has: page.getByText("Volume", { exact: true }) })).toContainText("2.600000");
  await expect(page.getByRole("figure").filter({ has: page.getByText("Fee revenue", { exact: true }) })).toContainText("0.007800");
  await expect(page.getByRole("row", { name: /Of those, activated/ })).toContainText("2 of 2");

  const funnel = page.getByRole("region", { name: "Funnel" });
  await expect(funnel.getByRole("row", { name: /Review opened/ })).toContainText("Browser reported");
  await expect(funnel.getByRole("row", { name: /^Landed/ })).toContainText("Chain answered");

  const sources = page.getByRole("region", { name: "Sources" });
  await expect(sources.getByRole("row", { name: /storm/ })).toContainText("2.200000");
  await expect(sources.getByRole("row", { name: /Unknown, none kept/ })).toContainText("0.400000");

  const activity = page.getByRole("region", { name: "Recent activity" });
  await expect(activity.locator("tr[data-source=chain]")).toContainText("Settled: landed");
  await expect(page.getByRole("figure").filter({ has: page.getByText("Volume", { exact: true }) })).toContainText("Verified");
  await expect(activity.locator("tr[data-source=server]")).toContainText("Seametry sent");
  await expect(activity.locator("tr[data-source=server]")).not.toContainText("Settled");
  await expect(activity.locator("tr[data-source=client]")).toContainText("Browser reported");

  const optIns = page.getByRole("region", { name: "Email opt-ins" });
  await expect(optIns).toContainText("s***@g***.com");
  await expect(optIns).toContainText("Withdrawn, address erased");

  const html = await page.content();
  expect(html).not.toContain("fixture-admin-token");
  expect(html).not.toContain("authorization");
  expect((await page.context().cookies()).map((cookie) => cookie.name)).toEqual(["better-auth.session_token"]);
});

test("an admin's date range and deployment reach the Gateway, and a refused range says so and reads the default", async ({ page }) => {
  await signIn(page, "fixture-admin");
  await page.goto("/admin?from=2026-10-10&to=2026-10-19&deployment=preview");
  await expect(page.getByRole("heading", { level: 1 }).locator("..")).toContainText("2026-10-10 00:00 UTC to 2026-10-20 00:00 UTC, preview");
  await expect(page.getByLabel("From")).toHaveValue("2026-10-10");
  await expect(page.getByLabel("To, inclusive")).toHaveValue("2026-10-19");

  await page.goto("/admin?from=2026-10-19&to=2026-10-01");
  const refused = page.getByRole("status").filter({ hasText: "The range was refused" });
  await expect(refused).toContainText("is not before");
  await expect(refused).toContainText("The last 30 days are shown instead.");
});

test("an admin with an empty record sees each section say what is absent", async ({ page }) => {
  await signIn(page, "fixture-admin-empty");
  await page.goto("/admin");
  await expect(page.getByText("The reconciler has not written a chain answer yet.", { exact: false })).toBeVisible();
  // With no reconciler answer, a chain-measured figure is unobserved, not verified.
  for (const label of ["Volume", "Fee revenue", "Landed legs"]) {
    const figure = page.getByRole("figure").filter({ has: page.getByText(label, { exact: true }) });
    await expect(figure).toContainText("No observation yet");
    await expect(figure).not.toContainText("Verified");
  }
  await expect(page.getByText("No quote was prepared in this period.")).toBeVisible();
  await expect(page.getByText("No leg was sent in this period.")).toBeVisible();
  await expect(page.getByText("No wallet was seen or traded in this period.")).toBeVisible();
  await expect(page.getByText("No wallet has asked for a quote in this deployment.")).toBeVisible();
  await expect(page.getByText("Nothing has been recorded before the end of this period.")).toBeVisible();
  await expect(page.getByText("No email consent was given in this period.")).toBeVisible();
});

test("an admin whose sections the Gateway cannot answer sees each one named unavailable, and the overview still", async ({ page }) => {
  await signIn(page, "fixture-admin-degraded");
  await page.goto("/admin");
  await expect(page.getByRole("figure").filter({ has: page.getByText("Volume", { exact: true }) })).toContainText("2.600000");
  for (const name of ["Sources", "Wallets", "Recent activity", "Email opt-ins"]) {
    await expect(page.getByRole("region", { name })).toContainText("answered 503");
    await expect(page.getByRole("region", { name })).toContainText("Nothing from this section is shown.");
  }
});

test("the wallet list pages by the Gateway's cursor and says how many wallets there are in all", async ({ page }) => {
  await signIn(page, "fixture-admin");
  await page.goto("/admin?deployment=production");
  const wallets = page.locator("section", { has: page.getByRole("heading", { name: "Wallets", exact: true }) });
  await expect(wallets.getByText("1 of 2 wallets, newest first seen first")).toBeVisible();
  await expect(wallets.getByRole("row", { name: /FFyr/ })).toBeVisible();
  await wallets.getByRole("link", { name: "Older wallets" }).click();
  await expect(page).toHaveURL(/wallets=fixture-older-wallets/);
  await expect(page).toHaveURL(/deployment=production/);
  await expect(wallets.getByRole("row", { name: /9WzD/ })).toBeVisible();
  await expect(wallets.getByRole("row", { name: /FFyr/ })).toHaveCount(0);
  await expect(wallets.getByRole("link", { name: "Older wallets" })).toHaveCount(0);
  await expect(wallets.getByRole("link", { name: "Newest wallets" })).toBeVisible();
});

test("a wallet cursor the Gateway refuses shows the wallet list unavailable, and the rest of the page still reads", async ({ page }) => {
  await signIn(page, "fixture-admin");
  const response = await page.goto("/admin?wallets=forged");
  expect(response?.status()).toBe(200);
  const wallets = page.locator("section", { has: page.getByRole("heading", { name: "Wallets", exact: true }) });
  await expect(wallets.getByText("The Gateway answered 400 for wallets.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sources", exact: true })).toBeVisible();
});
