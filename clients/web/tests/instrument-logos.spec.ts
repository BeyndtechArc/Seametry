import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import manifest from "../../../shared/evidence/instrument-logos.json";

test("every logo declared captured is mirrored, present, and byte-identical to what the manifest says is stored", () => {
  const captured = manifest.logos.filter((entry) => entry.state === "captured");
  expect(captured.length).toBeGreaterThan(0);
  for (const entry of captured) {
    expect(entry.path, "captured logo " + entry.symbol + " must name a local path").toMatch(/^\/instruments\/[A-Za-z0-9]+\.(svg|png|jpg|webp)$/);
    // Relative to clients/web, where Playwright runs, as the other specs read
    // files: Playwright loads specs as CommonJS, where import.meta does not parse.
    const file = "public" + entry.path;
    expect(existsSync(file), "missing mirror for " + entry.symbol + " at " + entry.path).toBe(true);
    const bytes = readFileSync(file);
    // A reduced copy records its own digest beside the issuer's; anything else is the issuer's file itself.
    const stored = "stored_sha256" in entry && entry.stored_sha256 ? { bytes: entry.stored_bytes, sha256: entry.stored_sha256 } : { bytes: entry.bytes, sha256: entry.sha256 };
    expect(bytes.length, "empty mirror " + entry.symbol).toBe(stored.bytes);
    expect(createHash("sha256").update(bytes).digest("hex"), "hash mismatch " + entry.symbol).toBe(stored.sha256);
    if (stored.sha256 !== entry.sha256) {
      // PNG width and height sit at bytes 16 and 20; the mirror keeps 128 pixels at most.
      expect(Math.max(bytes.readUInt32BE(16), bytes.readUInt32BE(20)), "oversized reduced copy " + entry.symbol).toBeLessThanOrEqual(128);
    }
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
