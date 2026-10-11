import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import manifest from "../../../shared/evidence/instrument-logos.json";

test("every logo declared captured is mirrored, present and byte-identical", () => {
  const captured = manifest.logos.filter((entry) => entry.state === "captured");
  expect(captured.length).toBeGreaterThan(0);
  for (const entry of captured) {
    expect(entry.path, "captured logo " + entry.symbol + " must name a local path").toMatch(/^\/instruments\/[A-Za-z0-9]+\.(svg|png|jpg|webp)$/);
    const file = fileURLToPath(new URL("../public" + entry.path, import.meta.url));
    expect(existsSync(file), "missing mirror for " + entry.symbol + " at " + entry.path).toBe(true);
    const bytes = readFileSync(file);
    expect(bytes.length, "empty mirror " + entry.symbol).toBe(entry.bytes);
    expect(createHash("sha256").update(bytes).digest("hex"), "hash mismatch " + entry.symbol).toBe(entry.sha256);
  }
});

test("a missing mirrored issuer image degrades to the symbol mark, not a broken image", async ({ page }) => {
  await page.route("**/instruments/*", (route) => route.abort());
  await page.goto("/app/baskets/prime-seven");
  const logo = page.getByTestId("lot-mark").first();
  await logo.scrollIntoViewIfNeeded();
  await expect(logo).toHaveText("AA");
});
