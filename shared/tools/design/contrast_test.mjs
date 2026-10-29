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

test('the dark ground is the warm near-black #1B1B18, and no surface is pure black or white', () => {
  assert.equal(value('dark', 'surface.ground'), '#1B1B18');
  for (const mode of ['dark', 'light']) {
    for (const key of ['ground', 'sheet', 'raised', 'tray', 'inverse']) {
      assert.ok(!['#000000', '#FFFFFF'].includes(value(mode, `surface.${key}`).toUpperCase()), `${mode} surface.${key}`);
    }
  }
});
