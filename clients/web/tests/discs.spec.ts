import { expect, test } from "@playwright/test";
import { BREAK, DISCS, END, discAt, fragmentsOf } from "../src/app/components/figures/discs/geometry";

// Pure geometry: the landing's discs (foundations section 7). Nested in
// equal steps, never cut by a straight edge, breaking above the field's
// middle into fragments that fade out well before the discs' bottom, the
// same on every render.

test("the discs are nested in equal steps, so the gaps are even at the top and even at the bottom", () => {
  const [outer, middle, inner] = DISCS;
  expect(middle!.r - inner!.r).toBeCloseTo(outer!.r - middle!.r, 6);
  expect(middle!.cy - inner!.cy).toBeCloseTo(outer!.cy - middle!.cy, 6);
  const top = (disc: typeof inner) => disc!.cy - disc!.r;
  const bottom = (disc: typeof inner) => disc!.cy + disc!.r;
  expect(top(middle) - top(outer)).toBeCloseTo(top(inner) - top(middle), 6);
  expect(bottom(outer) - bottom(middle)).toBeCloseTo(bottom(middle) - bottom(inner), 6);
  expect(top(outer)).toBeCloseTo(0, 6);
  // Not concentric: each disc sits lower than the one inside it, by about
  // 0.7 of its radius step, as Storm's mockup measures (centres about 203
  // px apart for radius steps of about 290 px, at 1280 wide).
  const drop = outer!.cy - middle!.cy;
  const step = outer!.r - middle!.r;
  expect(drop / step).toBeGreaterThan(0.65);
  expect(drop / step).toBeLessThan(0.75);
});

test("the discs break above the field's middle and are gone well before their bottom", () => {
  const [outer] = DISCS;
  expect(BREAK).toBeLessThan(outer!.cy);
  // Nothing shows in the lower third of the field (Storm, 24 October 2026).
  expect(END).toBeLessThan(outer!.cy + outer!.r * (1 / 3));
});

test("the fragments lie in a disc, thin out and fade with depth, and none reach the end", () => {
  const fragments = fragmentsOf();
  expect(fragments.length).toBeGreaterThan(100);
  for (const fragment of fragments) {
    expect(fragment.y).toBeGreaterThan(BREAK);
    expect(fragment.y).toBeLessThan(END);
    expect(discAt(fragment.x, fragment.y)?.tone).toBe(fragment.tone);
    expect(fragment.opacity).toBeGreaterThan(0);
  }
  const half = (BREAK + END) / 2;
  const upper = fragments.filter((f) => f.y < half);
  const lower = fragments.filter((f) => f.y >= half);
  expect(upper.length).toBeGreaterThan(lower.length * 2);
  const mean = (list: typeof fragments) => list.reduce((sum, f) => sum + f.opacity, 0) / list.length;
  expect(mean(lower)).toBeLessThan(mean(upper));
  const last = Math.max(...fragments.map((f) => f.y));
  expect(Math.min(...fragments.filter((f) => f.y === last).map((f) => f.opacity))).toBeLessThan(0.5);
});

test("the field is the same on every render", () => {
  expect(fragmentsOf()).toEqual(fragmentsOf());
});
