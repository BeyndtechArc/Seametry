import { BREAK, CENTRE_X, DISCS, HEIGHT, OVERLAP, cubeFaces, fragmentsOf } from "./geometry";
import styles from "./discs.module.css";

const n = (value: number) => value.toFixed(2);

/**
 * The landing's discs, drawn once on the server: whole above BREAK, then
 * breaking into fragments and a few falling cubes. Decorative, so hidden
 * from assistive technology; the page's sections paint over them.
 */
export function Discs() {
  const { fragments, cubes } = fragmentsOf();
  const whole = DISCS.map((disc) => `<circle class="${styles[`tone${disc.tone}`]}" cx="${CENTRE_X}" cy="${n(disc.cy)}" r="${n(disc.r)}"/>`).join("");
  const broken = fragments.map(({ x, y, size, tone }) => `<rect class="${styles[`tone${tone}`]}" x="${n(x - size / 2)}" y="${n(y - size / 2)}" width="${n(size)}" height="${n(size)}"/>`).join("");
  const falling = cubes.map((cube) => {
    const { top, left, right } = cubeFaces(cube);
    return `<path class="${styles[`tone${cube.tone}`]}" d="${top}"/><path class="${styles[`side${cube.tone}`]}" d="${left}"/><path class="${styles[`shade${cube.tone}`]}" d="${right}"/>`;
  }).join("");
  const svg = `<svg viewBox="0 0 100 ${n(HEIGHT)}" preserveAspectRatio="xMidYMin meet" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="discs-whole"><rect x="0" y="0" width="100" height="${BREAK + OVERLAP}"/></clipPath></defs><g clip-path="url(#discs-whole)">${whole}</g>${broken}${falling}</svg>`;
  return <div className={styles.field} dangerouslySetInnerHTML={{ __html: svg }} />;
}
