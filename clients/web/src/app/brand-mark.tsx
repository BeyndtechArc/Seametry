import Link from "next/link";
import styles from "./brand-mark.module.css";

/**
 * components.md, Brand mark. The one place the house's mark is drawn, used
 * by the public rail and the App shell alike. No mark file exists in this
 * repository yet (BRAND_AND_WORLD.md section 5 is still its brief), so the
 * square outline below is a stated placeholder, not a logo: replace the
 * span with the mark's SVG here and every shell changes with it.
 */
export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link className={styles.brand} href={href} aria-label="Seametry">
      <span className={styles.placeholderMark} aria-hidden="true" />
      <b>Seametry</b>
    </Link>
  );
}
