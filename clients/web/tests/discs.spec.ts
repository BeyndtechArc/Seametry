import { expect, test } from "@playwright/test";
import { BREAK, CELL, DISCS, END, HEIGHT, discAt, fragmentsOf } from "../src/app/components/figures/discs/geometry";

// Pure geometry: the landing's discs (foundations section 7). Nested in
// equal steps, never cut by a straight edge, and breaking into fragments
// and cubes that stay inside the field and are the same on every render.

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

test("the discs break below their break line into fragments that lie in a disc and thin out with depth", () => {
  const { fragments, cubes } = fragmentsOf();
  expect(fragments.length).toBeGreaterThan(100);
  for (const fragment of fragments) {
    expect(fragment.y).toBeGreaterThan(BREAK);
    expect(fragment.y).toBeLessThan(END);
    expect(discAt(fragment.x, fragment.y)?.tone).toBe(fragment.tone);
  }
  const half = (BREAK + END) / 2;
  expect(fragments.filter((f) => f.y < half).length).toBeGreaterThan(fragments.filter((f) => f.y >= half).length * 2);
  for (const cube of cubes) {
    expect(cube.y).toBeGreaterThan(BREAK);
    expect(cube.y + cube.size).toBeLessThanOrEqual(HEIGHT);
  }
  expect(cubes.length).toBeGreaterThan(5);
  expect(CELL).toBeGreaterThan(0);
});

test("the field is the same on every render", () => {
  expect(fragmentsOf()).toEqual(fragmentsOf());
});
