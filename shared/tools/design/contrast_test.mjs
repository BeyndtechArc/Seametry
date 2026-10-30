import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// WCAG 2.2 contrast for each theme's text and focus pairs, from the token
// source (.claude/skills/seametry-design/assets/tokens/seametry.tokens.json).
// Text needs 4.5:1 (AA), focus rings and control shapes 3:1 (1.4.11).
const tokens = JSON.parse(readFileSync(new URL('../../../.claude/skills/seametry-design/assets/tokens/seametry.tokens.json', import.meta.url), 'utf8'));

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const value = (mode, path) => path.split('.').reduce((node, key) => node[key], tokens.theme[mode]).$value;

const pairs = [
  ['text.primary', 'surface.ground', 4.5], ['text.primary', 'surface.raised', 4.5], ['text.primary', 'surface.tray', 4.5],
  ['text.secondary', 'surface.ground', 4.5], ['text.secondary', 'surface.raised', 4.5], ['text.secondary', 'surface.tray', 4.5],
  ['text.tertiary', 'surface.ground', 4.5], ['text.tertiary', 'surface.sheet', 4.5],
  ['text.onTouch', 'accent.touch', 4.5], ['text.onTouch', 'accent.touchPressed', 4.5],
  ['accent.touchText', 'surface.ground', 4.5], ['accent.touchText', 'surface.sheet', 4.5],
  ['text.inverse', 'surface.inverse', 4.5],
  ['accent.provenance', 'surface.ground', 3], ['accent.provenance', 'surface.raised', 3],
  ['status.success', 'surface.ground', 4.5], ['status.warning', 'surface.ground', 4.5], ['status.error', 'surface.ground', 4.5],
  ['status.success', 'surface.raised', 4.5], ['status.warning', 'surface.raised', 4.5], ['status.error', 'surface.raised', 4.5],
  ['feature.text.primary', 'feature.ground', 4.5], ['feature.text.secondary', 'feature.ground', 4.5], ['feature.text.secondary', 'feature.sheet', 4.5],
];

for (const mode of ['dark', 'light']) {
  test(`${mode} text and focus pairs meet WCAG AA`, () => {
    for (const [foreground, background, needed] of pairs) {
      const ratio = contrast(value(mode, foreground), value(mode, background));
      assert.ok(ratio >= needed, `${mode} ${foreground} on ${background}: ${ratio.toFixed(2)}:1, needs ${needed}:1`);
    }
  });
}

// Dark draws primary controls as a filled shape on the ground, so the fill
// itself must read at 3:1. Light's lime fill reads 2.04:1 and relies on its
// label; that is a light-theme follow-up, not asserted here.
test('the dark primary action fill reads as a shape against the ground', () => {
  assert.ok(contrast(value('dark', 'accent.touch'), value('dark', 'surface.ground')) >= 3);
  assert.ok(contrast(value('dark', 'accent.touch'), value('dark', 'surface.raised')) >= 3);
});

function oklch(hex) {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, chroma: Math.hypot(a, bb) };
}

// A pane that kept the ground's chroma while getting lighter read as khaki
// beside the olive-black ground (Storm, 30 October 2026), so each step up
// must be lighter and no more chromatic than the one below it.
test('each dark surface above the ground is lighter and no more chromatic than the step below', () => {
  const ladder = ['ground', 'sheet', 'raised', 'tray'].map((key) => [key, oklch(value('dark', `surface.${key}`))]);
  for (let step = 1; step < ladder.length; step += 1) {
    const [lowerName, lower] = ladder[step - 1];
    const [name, upper] = ladder[step];
    assert.ok(upper.lightness > lower.lightness, `dark surface.${name} is not lighter than surface.${lowerName}`);
    assert.ok(upper.chroma <= lower.chroma, `dark surface.${name} chroma ${upper.chroma.toFixed(4)} exceeds surface.${lowerName} ${lower.chroma.toFixed(4)}`);
  }
});

test('no surface is pure black or white', () => {
  for (const mode of ['dark', 'light']) {
    for (const key of ['ground', 'sheet', 'raised', 'tray', 'inverse']) {
      assert.ok(!['#000000', '#FFFFFF'].includes(value(mode, `surface.${key}`).toUpperCase()), `${mode} surface.${key}`);
    }
  }
});
