import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import manifest from "../../../shared/evidence/instrument-logos.json";

test("every logo declared captured is mirrored, present and byte-identical", () => {
  const captured = manifest.logos.filter((entry) => entry.state === "captured");
  expect(captured.length).toBeGreaterThan(0);
  for (const entry of captured) {
    expect(entry.path, "captured logo " + entry.symbol + " must name a local path").toMatch(/^\/instruments\/[A-Za-z0-9]+\.(svg|png|jpg|webp)$/);
    // Relative to clients/web, where Playwright runs, as the other specs read
    // files: Playwright loads specs as CommonJS, where import.meta does not parse.
    const file = "public" + entry.path;
    expect(existsSync(file), "missing mirror for " + entry.symbol + " at " + entry.path).toBe(true);
    const bytes = readFileSync(file);
    expect(bytes.length, "empty mirror " + entry.symbol).toBe(entry.bytes);
    expect(createHash("sha256").update(bytes).digest("hex"), "hash mismatch " + entry.symbol).toBe(entry.sha256);
  }
});

test("a missing mirrored issuer image degrades to the symbol mark, not a broken image", async ({ page }) => {
  await page.route("**/instruments/*", (route) => route.abort());
  await page.goto("/app/baskets/prime-seven");
  // The marks load lazily, so they are brought into view first. The heading is
  // scrolled rather than a mark, because a mark is replaced as its image fails.
  await page.getByRole("heading", { name: "Composition" }).scrollIntoViewIfNeeded();
  await expect(page.getByTestId("lot-mark").first()).toHaveText("AA");
});
