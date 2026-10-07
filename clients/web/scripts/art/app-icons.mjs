/**
 * The installed app's icons, rendered from the house mark so redrawing
 * public/logo.svg redraws them. iOS fills a transparent icon with black, so
 * the mark sits on the light ground (the default mode) rather than on nothing.
 *
 * Run (from clients/web): node scripts/art/app-icons.mjs
 * Writes public/icons/icon-192.png, icon-512.png and apple-touch-icon.png (180).
 */
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { theme } from "../../../packages/ui/src/generated/tokens.ts";

const out = "public/icons";
const mark = readFileSync("public/logo.svg", "utf8");
const sizes = { "icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180 };

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [name, size] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // The mark spans 70% of the square: Android's maskable crop keeps the
  // centre 80%, and iOS rounds the corners, so the edges stay empty.
  const inset = Math.round(size * 0.15);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${theme.light.surface.ground};display:grid;place-items:center">` +
      `<div style="width:${size - 2 * inset}px;height:${size - 2 * inset}px">${mark.replace("<svg ", '<svg style="width:100%;height:100%" ')}</div></body></html>`,
  );
  await page.screenshot({ path: `${out}/${name}`, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log(`wrote ${Object.keys(sizes).map((name) => `${out}/${name}`).join(", ")}`);
