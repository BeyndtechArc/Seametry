import { test, expect } from "@playwright/test";

// Every route this app serves. Phase 6 adds real pages; each one joins this
// list, since a route the design skill ships without also joining this test
// is a route whose CSP compliance was assumed, not checked. Every route must
// also call connection() (see src/app/page.tsx) so its nonce is fresh per
// request rather than baked in at build time.
const routes = [
  "/",
  "/hall-demo",
  "/how-it-works",
  "/patterns",
  "/sign-in",
  "/terminal",
  "/terminal/alloys/storm",
  "/terminal/instruments/XsTockMint111111111111111111111111111111111",
  "/the-key",
];

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
