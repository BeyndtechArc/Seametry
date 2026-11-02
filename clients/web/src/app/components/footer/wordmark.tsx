"use client";

import discs from "../figures/discs/discs.module.css";
import styles from "./wordmark.module.css";

// components.md, Closing wordmark: the house name across the whole window
// at the foot of every public page, cut as a stencil from the page's ground
// so the hero's outer disc tone shows only through its letters, rising into
// them as the page's end comes into view (Storm, 24 October 2026); a plain
// fill, since the discs' curved edges crossing the word read as a defect
// (Storm, 1 November 2026). Two layers: the fill moves on a CSS view
// timeline, which the compositor runs; the stencil
// stays still above them. Decorative: the House rail already names the
// house for assistive technology. A client component with no props, so a
// server page sends it as a reference rather than as its markup a second
// time in the React payload.

const WIDTH = 1600;
const HEIGHT = 420;
/** The frame starts just above the letters' cap height, so no empty band sits over the word. */
const TOP = 110;
/** Set from the left edge: a centred anchor with a fixed text length shifts the word in Chrome. */
const MARGIN = 30;

export function ClosingWordmark() {
  return (
    <div className={styles.wordmark} aria-hidden="true">
      <div className={styles.rise}>
        <svg viewBox={`0 ${TOP} ${WIDTH} ${HEIGHT - TOP}`}>
          <rect width={WIDTH} height={HEIGHT} className={discs.tone2} />
        </svg>
      </div>
      <svg viewBox={`0 ${TOP} ${WIDTH} ${HEIGHT - TOP}`} className={styles.stencil}>
        <defs>
          <mask id="wordmark-letters">
            <rect width={WIDTH} height={HEIGHT} fill="white" />
            <text x={MARGIN} y={HEIGHT - 24} textLength={WIDTH - MARGIN * 2} lengthAdjust="spacing" className={styles.letters} fill="black">Seametry</text>
          </mask>
        </defs>
        <rect width={WIDTH} height={HEIGHT} mask="url(#wordmark-letters)" className={styles.ground} />
        <text x={MARGIN} y={HEIGHT - 24} textLength={WIDTH - MARGIN * 2} lengthAdjust="spacing" className={`${styles.letters} ${styles.outline}`}>Seametry</text>
      </svg>
    </div>
  );
}
