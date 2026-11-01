import { expect, test } from "@playwright/test";
import { safeReturnPath } from "../src/lib/return-path";

// The sign-in page's way back (src/lib/return-path.ts): a path on this site,
// or nothing.
test("a return path on this site is kept, query and all", () => {
  for (const path of ["/admin", "/admin?from=2026-10-01&deployment=preview", "/app/allocation#review"]) {
    expect(safeReturnPath(path), path).toBe(path);
  }
});

test("an external, protocol-relative or script return URL is refused", () => {
  for (const hostile of [
    "https://evil.example/admin", "//evil.example/admin", "/\\\\evil.example", "\\\\evil.example", "/\\t/evil.example",
    "javascript:alert(1)", "admin", "", " /admin", "/%2F%2Fevil.example", "http:/evil.example",
  ]) {
    expect(safeReturnPath(hostile), JSON.stringify(hostile)).toBeUndefined();
  }
  expect(safeReturnPath(undefined)).toBeUndefined();
});

test("the sign-in page sends Google back to a next path on this site, and to itself otherwise", async ({ page }) => {
  for (const [next, expected] of [["/admin", "/admin"], ["//evil.example/admin", "/sign-in"], ["https://evil.example", "/sign-in"]]) {
    await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
    await expect(page.locator("[data-return-to]"), next).toHaveAttribute("data-return-to", expected);
  }
});
