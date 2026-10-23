// The landing's discs (foundations section 7, Storm, 23 October 2026), in
// vw units so they keep their shape at any width: x across the window, y
// down from the outer disc's top. They are nested in equal steps, measured
// from Storm's mockup at 1280 wide (radii 248, 546.5 and about 829 px,
// centres 1011, 1210.5 and about 1417 px): each is larger than the one
// inside it by the same radius and lower by the same distance, so the gaps
// are even at the top and even at the bottom. Above BREAK they are whole;
// below it they break into square fragments that thin out with depth,
// and a few fragments fall away as small isometric cubes.

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

/** Where the discs start to break, and where the last fragment may sit. */
export const BREAK = 72;
export const END = 112;
export const CELL = 1.6;
/** How far whole squares, and the whole discs' clip, reach past their edges so no hairline shows between them. */
export const OVERLAP = 0.06;
/** The height the field occupies, cubes included. */
export const HEIGHT = END + CELL * 8;

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

export interface Fragment { x: number; y: number; size: number; tone: number }
export interface Cube { x: number; y: number; size: number; tone: number }

/**
 * The broken part of the field. A cell inside a disc stays, as a square a
 * little smaller than its cell, with a chance that falls with its depth
 * below BREAK; a few of the cells that fall away reappear lower, as cubes.
 */
export function fragmentsOf() {
  const fragments: Fragment[] = [];
  const cubes: Cube[] = [];
  const rows = Math.round((END - BREAK) / CELL);
  const columns = Math.round(100 / CELL);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const x = i * CELL + CELL / 2;
      const y = BREAK + j * CELL + CELL / 2;
      const disc = discAt(x, y);
      if (!disc) continue;
      const depth = (j + 0.5) / rows;
      if (hash(i, j, 1) > depth ** 0.8) {
        // Whole squares at first, a hair larger than their cells so
        // neighbours overlap instead of leaving an anti-aliased seam, and
        // the gaps open only as the fragments go deeper.
        const loose = Math.max(0, depth - 0.15) / 0.85;
        fragments.push({ x, y, size: loose ? CELL * (1 - 0.45 * loose) : CELL + OVERLAP, tone: disc.tone });
      } else if (hash(i, j, 2) < 0.07) {
        const fall = CELL * (1.5 + 6 * depth * hash(i, j, 3));
        cubes.push({ x: x + (hash(i, j, 4) - 0.5) * CELL * 3, y: y + fall, size: CELL * (0.35 + 0.15 * hash(i, j, 5)), tone: disc.tone });
      }
    }
  }
  return { fragments, cubes };
}

const at = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;

/** An isometric cube's three visible faces, top first, as path data. */
export function cubeFaces({ x, y, size: s }: Cube) {
  const w = s * Math.cos(Math.PI / 6);
  const h = s / 2;
  return {
    top: `M${at(x, y - s)}L${at(x + w, y - h)}L${at(x, y)}L${at(x - w, y - h)}Z`,
    left: `M${at(x - w, y - h)}L${at(x, y)}L${at(x, y + s)}L${at(x - w, y + h)}Z`,
    right: `M${at(x, y)}L${at(x + w, y - h)}L${at(x + w, y + h)}L${at(x, y + s)}Z`,
  };
}
