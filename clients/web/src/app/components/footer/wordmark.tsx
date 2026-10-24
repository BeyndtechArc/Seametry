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
 * reverse, scattered across the word's width rather than stacked in rows:
 * each square sits loose in its cell, larger, deeper in tone and more
 * likely near the word and its middle, smaller, fainter and rarer toward
 * the top and the ends, so the field dissolves instead of drawing an edge.
 * Opacity steps by tenths, so equal squares share one.
 */
const CELL = 26;
/** Down to just above the letters' cap height, so no square touches a letter. */
const FIELD = 150;
const ROWS = Math.floor(FIELD / CELL);
/** Even nearest the word's middle, about one cell in two is empty. */
const DENSEST = 0.55;
function hash(i: number, j: number, salt: number) {
  let h = (i * 374761393 + j * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fragments: { x: number; y: number; size: number; tone: number; opacity: number }[] = [];
for (let j = 0; j < ROWS; j++) {
  // 1 on the row nearest the word, falling toward 0 at the top.
  const near = (j + 1) / ROWS;
  for (let i = 0; (i + 1) * CELL <= WIDTH; i++) {
    // 1 over the word's middle, 0 at its ends.
    const middle = 1 - Math.abs((i + 0.5) * CELL - CENTRE) / CENTRE;
    const weight = near ** 1.4 * middle ** 0.8;
    if (hash(i, j, 1) > DENSEST * weight) continue;
    const size = (CELL - 4) * (0.4 + 0.6 * weight * (0.7 + 0.3 * hash(i, j, 2)));
    const slack = CELL - size;
    fragments.push({
      x: i * CELL + slack * hash(i, j, 3),
      y: j * CELL + slack * hash(i, j, 4),
      size,
      tone: weight > 0.55 ? 0 : weight > 0.25 ? 1 : 2,
      opacity: Math.round((0.35 + 0.65 * weight) * 10) / 10,
    });
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
          <rect key={`${square.x}-${square.y}`} x={square.x.toFixed(2)} y={square.y.toFixed(2)} width={square.size.toFixed(2)} height={square.size.toFixed(2)} fillOpacity={square.opacity} className={discs[`tone${square.tone}`]} />
        ))}
        <text x={MARGIN} y={HEIGHT - 24} textLength={WIDTH - MARGIN * 2} lengthAdjust="spacing" className={`${styles.letters} ${styles.outline}`}>Seametry</text>
      </svg>
    </div>
  );
}
