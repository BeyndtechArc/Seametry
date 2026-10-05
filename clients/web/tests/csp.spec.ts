import { test, expect } from "@playwright/test";

// Every route this app serves. Phase 6 adds real pages; each one joins this
// list, since a route the design skill ships without also joining this test
// is a route whose CSP compliance was assumed, not checked. Every route must
// also call connection() (see src/app/page.tsx) so its nonce is fresh per
// request rather than baked in at build time.
const routes = [
  "/",
  "/app",
  "/app/allocation",
  "/app/alloys",
  "/app/alloys/storm",
  "/app/alloys/6BD6PprLyhiLeXKTAiLRA2hyMwUqMzpQPzftabQuduQ",
  "/app/compose",
  "/app/hall",
  "/app/instruments",
  "/app/instruments/XsTockMint111111111111111111111111111111111",
  "/how-it-works",
  "/papers/the-exit",
  "/patterns",
  "/sign-in",
  "/the-key",
];

test("a shared link previews with the meta flyer, served from this app", async ({ page, request }) => {
  await page.goto("/");
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toBe("https://www.seametry.xyz/Seametry%20meta%20flyer.png");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", image!);
  const flyer = await request.get(new URL(image!).pathname);
  expect(flyer.status()).toBe(200);
  expect(flyer.headers()["content-type"]).toBe("image/png");
});

test("an unknown route returns the house 404 under the application policy", async ({ page }) => {
  const violations: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations ??= [];
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
        `${event.violatedDirective}: ${event.blockedURI}`,
      );
    });
  });

  const response = await page.goto("/a-route-that-is-not-registered", { waitUntil: "networkidle" });
  const policy = response?.headers()["content-security-policy"] ?? "";
  violations.push(...await page.evaluate(
    () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
  ));

  expect(response?.status()).toBe(404);
  expect(policy).toContain("default-src 'self'");
  expect(policy).toMatch(/'nonce-[^']+'/);
  expect(violations).toEqual([]);
  expect(pageErrors).toEqual([]);
  await expect(page.getByRole("heading", { level: 1, name: "That route is not in the register." })).toBeVisible();
});

for (const route of routes) {
  test(`${route} sends the required security headers, with a fresh nonce`, async ({ page }) => {
    const first = await page.goto(route);
    const firstCsp = first?.headers()["content-security-policy"] ?? "";
    const firstNonce = firstCsp.match(/'nonce-([^']+)'/)?.[1];
    expect(firstNonce, "a nonce must be present in script-src").toBeTruthy();

    expect(firstCsp).toContain("default-src 'self'");
    expect(firstCsp).toContain("'strict-dynamic'");
    expect(firstCsp).toContain("object-src 'none'");
    expect(firstCsp).toContain("base-uri 'none'");
    expect(firstCsp).toContain("frame-ancestors 'none'");
    expect(firstCsp).not.toContain("'unsafe-inline'");

    expect(first?.headers()["referrer-policy"]).toBe("no-referrer");
    expect(first?.headers()["x-content-type-options"]).toBe("nosniff");

    const second = await page.goto(route);
    const secondNonce = (second?.headers()["content-security-policy"] ?? "").match(/'nonce-([^']+)'/)?.[1];
    expect(secondNonce, "two requests must not share a nonce").not.toBe(firstNonce);
  });

  test(`${route} loads with no CSP violation and no console error`, async ({ page }) => {
    const violations: string[] = [];
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));
    // A CSP violation fires this DOM event in every browser that enforces
    // the policy; catching it directly, rather than only scraping the console
    // message, is what makes this assertion independent of Chromium's exact
    // wording for the message.
    await page.addInitScript(() => {
      window.addEventListener("securitypolicyviolation", (e) => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations ??= [];
        (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
          `${e.violatedDirective}: ${e.blockedURI}`,
        );
      });
    });

    await page.goto(route, { waitUntil: "networkidle" });

    const reported = await page.evaluate(
      () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
    );
    violations.push(...reported);

    expect(violations, "CSP violations reported by the browser itself").toEqual([]);
    expect(consoleErrors, "console.error calls, which a CSP violation also logs").toEqual([]);
    expect(pageErrors, "uncaught page errors, which a blocked hydration script produces").toEqual([]);
  });
}
