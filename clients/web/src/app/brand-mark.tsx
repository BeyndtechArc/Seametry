import Link from "next/link";
import styles from "./brand-mark.module.css";

// The mark is public/logo.svg itself, never a copy of its paths: a pasted
// copy here drifted from the file and a redrawn logo never reached the site.
// It is several colours with its own outline, so it is drawn as an image
// rather than recoloured by the theme.
export function BrandMark({ href = "/", compactOnNarrow = false }: { href?: string; compactOnNarrow?: boolean }) {
  return (
    <Link className={`${styles.brand} ${compactOnNarrow ? styles.compactOnNarrow : ""}`} href={href} aria-label="Seametry">
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image writes an inline style attribute, which this site's CSP (style-src without unsafe-inline) refuses; an SVG needs none of its optimisation. */}
      <img className={styles.mark} src="/logo.svg" width={229} height={232} alt="" />
      <b>Seametry</b>
    </Link>
  );
}
