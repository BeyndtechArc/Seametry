"use client";

import discs from "../figures/discs/discs.module.css";
import styles from "./wordmark.module.css";

// components.md, Closing wordmark: the house name across the whole window
// at the foot of every public page, cut as a stencil from the page's ground
// so the hero's discs show only through its letters, rising into them as
// the page's end comes into view (Storm, 24 October 2026). Two layers: the
// discs move on a CSS view timeline, which the compositor runs; the stencil
// stays still above them. Decorative: the House rail already names the
// house for assistive technology. A client component with no props, so a
// server page sends it as a reference rather than as its markup a second
// time in the React payload.

const WIDTH = 1600;
const HEIGHT = 420;
const CENTRE = WIDTH / 2;
/** Set from the left edge: a centred anchor with a fixed text length shifts the word in Chrome. */
const MARGIN = 30;
/** The hero's nesting, redrawn for this frame: each disc larger by one step and lower by one drop than the one inside it. */
const INNER = { r: 300, top: 250 };
const STEP = 260;
const DROP = 110;
const rings = [2, 1, 0].map((index) => {
  const r = INNER.r + STEP * index;
  return { index, r, cy: INNER.top - DROP * index + r };
});

/**
 * Above the letters the discs break into squares, the hero's fragments in
 * reverse: dense just over the word and thinning toward the top, each a
 * step deeper than the disc it falls in, since the outer disc's own tone is
 * too close to the ground to read as a fragment.
 */
const CELL = 28;
/** Down to just above the letters' cap height, so no square touches a letter. */
const FIELD = 140;
/** Even the row nearest the word is broken: a full row reads as a bar, not a fragment. */
const DENSEST = 0.62;
function hash(i: number, j: number) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const ROWS = Math.floor(FIELD / CELL);
const fragments: { x: number; y: number; tone: number; faint: boolean }[] = [];
for (let j = 0; j < ROWS; j++) {
  const depth = (j + 1) / ROWS;
  for (let i = 0; i * CELL < WIDTH; i++) {
    const x = i * CELL;
    const y = j * CELL;
    const disc = [...rings].reverse().find((ring) => (x + CELL / 2 - CENTRE) ** 2 + (y + CELL / 2 - ring.cy) ** 2 <= ring.r ** 2);
    if (disc && hash(i, j) <= DENSEST * depth ** 1.6) fragments.push({ x, y, tone: Math.max(0, disc.index - 1), faint: depth < 0.5 });
  }
}

export function ClosingWordmark() {
  return (
    <div className={styles.wordmark} aria-hidden="true">
      <div className={styles.rise}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          {rings.map((ring) => (
            <circle key={ring.index} cx={CENTRE} cy={ring.cy} r={ring.r} className={discs[`tone${ring.index}`]} />
          ))}
        </svg>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.stencil}>
        <defs>
          <mask id="wordmark-letters">
            <rect width={WIDTH} height={HEIGHT} fill="white" />
            <text x={MARGIN} y={HEIGHT - 24} textLength={WIDTH - MARGIN * 2} lengthAdjust="spacing" className={styles.letters} fill="black">Seametry</text>
          </mask>
        </defs>
        <rect width={WIDTH} height={HEIGHT} mask="url(#wordmark-letters)" className={styles.ground} />
        {fragments.map((square) => (
          <rect key={`${square.x}-${square.y}`} x={square.x + 2} y={square.y + 2} width={CELL - 3} height={CELL - 3} className={discs[`tone${square.tone}`]} data-faint={square.faint ? "" : undefined} />
        ))}
        <text x={MARGIN} y={HEIGHT - 24} textLength={WIDTH - MARGIN * 2} lengthAdjust="spacing" className={`${styles.letters} ${styles.outline}`}>Seametry</text>
      </svg>
    </div>
  );
}
