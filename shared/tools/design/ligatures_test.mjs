/**
 * Guards server/cmd/explorer/assets/explorer.css's digest-face rule against
 * Fragment Mono's default programming ligatures.
 *
 * Proven directly in Chromium against the repo's own font file: without
 * font-variant-ligatures: none and font-feature-settings: "liga" 0, "calt" 0,
 * the sequences "<-", "==" and "|-" that occur in real hex digests and
 * addresses render as a single arrow, one long bar and a turnstile. A CSS
 * rule cannot be asserted by reading its text, since the browser is free to
 * ignore or override it; this renders the actual page and compares pixels,
 * the only way to know what a visitor actually sees.
 *
 * Both screenshots below come from the same loaded page, with the ligature
 * properties toggled afterward through the CSSOM. An earlier version loaded
 * two separate pages (the real stylesheet, and a hand-written baseline) and
 * compared their screenshots directly; that failed for reasons that had
 * nothing to do with ligatures (an unresolved token variable, a class
 * selector standing in for explorer.css's tag selector, a line-height
 * difference shifting one screenshot's crop by a few pixels), because two
 * differently built pages are never guaranteed identical except in the one
 * property under test. Same page, same box, one property toggled removes
 * every one of those confounds at once.
 *
 * Needs the fetched font files, which are gitignored: run
 * npm run fonts --workspace=clients/web first. The first CI run of this test
 * failed with ENOENT for exactly that reason, after passing locally.
 *
 * Run: node --test shared/tools/design/ligatures_test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const CSS_PATH = 'server/cmd/explorer/assets/explorer.css';
const TOKENS_PATH = 'clients/packages/ui/src/generated/tokens.css';
const FONT_PATH = 'clients/web/fonts/FragmentMono-Regular.woff2';
// Contains the three sequences proven to trigger Fragment Mono's default
// ligatures: <- (an arrow), == (one long bar), |- (a turnstile).
const SAMPLE = 'a<-b==c|-d0x7F';

test('explorer.css turns off Fragment Mono ligatures on its digest-face rule', async () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  const tokens = readFileSync(TOKENS_PATH, 'utf8');
  const fontUrl = `data:font/woff2;base64,${readFileSync(FONT_PATH).toString('base64')}`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.setContent(`<!doctype html><html><head><style>
      @font-face { font-family: "Fragment Mono"; src: url(${fontUrl}); }
      ${tokens}
      ${css}
      body { margin: 0; background: #000 }
    </style></head><body><code>${SAMPLE}</code></body></html>`);
    await page.evaluate(() => document.fonts.ready);

    const computed = await page.locator('code').evaluate((el) => {
      const c = getComputedStyle(el);
      return { fontFamily: c.fontFamily, fontVariantLigatures: c.fontVariantLigatures, fontFeatureSettings: c.fontFeatureSettings };
    });
    assert.match(computed.fontFamily, /Fragment Mono/,
      `<code> is not set to the digest face at all (computed font-family: ${computed.fontFamily}); ` +
      'the rest of this test would pass vacuously without this');
    assert.equal(computed.fontVariantLigatures, 'none',
      `explorer.css's digest-face rule must set font-variant-ligatures: none (computed: ${computed.fontVariantLigatures})`);

    const box = await page.locator('code').boundingBox();
    const clip = { x: box.x, y: box.y, width: Math.ceil(box.width) + 4, height: Math.ceil(box.height) + 4 };
    const asShipped = createHash('sha256').update(await page.screenshot({ clip })).digest('hex');

    // Same page, same element, same box: only the two ligature properties
    // change, overridden back to their browser defaults through the CSSOM
    // rather than by loading a second page.
    await page.evaluate(() => {
      const el = document.querySelector('code');
      el.style.setProperty('font-variant-ligatures', 'normal', 'important');
      el.style.setProperty('font-feature-settings', 'normal', 'important');
    });
    const ligaturesForcedOn = createHash('sha256').update(await page.screenshot({ clip })).digest('hex');

    assert.notEqual(asShipped, ligaturesForcedOn,
      'forcing font-variant-ligatures back to normal did not change the rendered pixels, ' +
      'so explorer.css\'s digest-face rule is not actually suppressing ligatures in this font/sample');
  } finally {
    await browser.close();
  }
});
