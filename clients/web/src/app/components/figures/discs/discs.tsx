"use client";

import { BREAK, CENTRE_X, DISCS, HEIGHT, OVERLAP, fragmentsOf } from "./geometry";
import styles from "./discs.module.css";

const n = (value: number) => value.toFixed(2);

/**
 * The field, built once per runtime. It is a client component only so its
 * shapes are not serialised: a server component's markup is sent twice, in
 * the HTML and again in the payload React hydrates from, and the page is
 * rendered on every request.
 */
const FIELD = (() => {
  const whole = DISCS.map((disc) => `<circle class="${styles[`tone${disc.tone}`]}" cx="${CENTRE_X}" cy="${n(disc.cy)}" r="${n(disc.r)}"/>`).join("");
  const broken = fragmentsOf().map(({ x, y, size, tone, opacity }) =>
    `<rect class="${styles[`tone${tone}`]}" x="${n(x - size / 2)}" y="${n(y - size / 2)}" width="${n(size)}" height="${n(size)}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ""}/>`,
  ).join("");
  return `<svg viewBox="0 0 100 ${n(HEIGHT)}" preserveAspectRatio="xMidYMin meet" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="discs-whole"><rect x="0" y="0" width="100" height="${BREAK + OVERLAP}"/></clipPath></defs><g clip-path="url(#discs-whole)">${whole}</g>${broken}</svg>`;
})();

/** The landing's discs: whole above BREAK, then breaking into fragments that fade out. Decorative, so hidden from assistive technology; the page's sections paint over them. */
export function Discs() {
  return <div className={styles.field} dangerouslySetInnerHTML={{ __html: FIELD }} />;
}
