// The landing's discs (foundations section 7, Storm, 23 October 2026), in
// vw units so they keep their shape at any width: x across the window, y
// down from the outer disc's top. They are nested in equal steps, measured
// from Storm's mockup at 1280 wide (radii 248, 546.5 and about 829 px,
// centres 1011, 1210.5 and about 1417 px): each is larger than the one
// inside it by the same radius and lower by the same distance, so the gaps
// are even at the top and even at the bottom. Above BREAK they are whole;
// below it they break into square fragments that thin out and fade, and
// are gone by END, well before the discs' bottom, so the lower part of the
// field never shows (Storm, 24 October 2026).

export const CENTRE_X = 50;
/** The innermost radius, and each step out: larger by RADIUS_STEP, lower by DROP. */
const INNER_R = 19.4;
const RADIUS_STEP = 22.7;
const DROP = 15.8;

/** Outer first, so a later disc paints over an earlier one. */
export const DISCS = [2, 1, 0].map((step) => {
  const r = INNER_R + RADIUS_STEP * step;
  const outer = INNER_R + RADIUS_STEP * 2;
  return { tone: step, r, cy: outer - DROP * (2 - step) };
});

/**
 * Where the discs start to break, above the middle of the field (the outer
 * disc's centre, 64.8), and where the last fragment has faded out.
 */
export const BREAK = 46;
export const END = 86;
export const CELL = 2.4;
/** How far whole squares, and the whole discs' clip, reach past their edges so no hairline shows between them. */
export const OVERLAP = 0.06;
/** The height the field occupies. */
export const HEIGHT = END;

/** A repeatable number in [0, 1) for a cell, so every render draws the same fragments. */
function hash(i: number, j: number, salt: number) {
  let h = (i * 374761393 + j * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The innermost disc a point lies in, or undefined outside them all. */
export function discAt(x: number, y: number) {
  for (const disc of [...DISCS].reverse()) {
    if ((x - CENTRE_X) ** 2 + (y - disc.cy) ** 2 <= disc.r ** 2) return disc;
  }
  return undefined;
}

/** A square of the broken field: its centre, side, disc and how much of it shows. */
export interface Fragment { x: number; y: number; size: number; tone: number; opacity: number }

/**
 * The broken part of the field. A cell inside a disc stays with a chance
 * that falls with its depth below BREAK; it is whole at first, a hair
 * larger than its cell so neighbours overlap instead of leaving an
 * anti-aliased seam, then smaller and fainter as it goes deeper, until
 * none shows at END. Opacity steps by twentieths, so equal fragments share
 * a value.
 */
export function fragmentsOf(): Fragment[] {
  const fragments: Fragment[] = [];
  const rows = Math.round((END - BREAK) / CELL);
  const columns = Math.ceil(100 / CELL);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const x = i * CELL + CELL / 2;
      const y = BREAK + j * CELL + CELL / 2;
      const disc = discAt(x, y);
      if (!disc) continue;
      const depth = (j + 0.5) / rows;
      if (hash(i, j, 1) <= depth ** 0.8) continue;
      const loose = Math.max(0, depth - 0.15) / 0.85;
      const fading = Math.max(0, depth - 0.35) / 0.65;
      fragments.push({
        x,
        y,
        size: loose ? CELL * (1 - 0.4 * loose) : CELL + OVERLAP,
        tone: disc.tone,
        opacity: Math.round((1 - fading * fading) * 20) / 20,
      });
    }
  }
  return fragments.filter((fragment) => fragment.opacity > 0);
}
