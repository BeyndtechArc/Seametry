import Link from "next/link";
import styles from "./brand-mark.module.css";

export function BrandMark({ href = "/", compactOnNarrow = false }: { href?: string; compactOnNarrow?: boolean }) {
  return (
    <Link className={`${styles.brand} ${compactOnNarrow ? styles.compactOnNarrow : ""}`} href={href} aria-label="Seametry">
      <svg aria-hidden="true" viewBox="0 0 314 235" fill="none">
        <path d="M158.002 234.722 98.3969 170.055 158.002 194.409 214.158 170.055 158.002 234.722Z" />
        <path d="M296.016 81.2958 313.416 161.327 244.201 110.741 189.802 135.839 158.138 147.587 126.474 135.839 70.1726 109.863 0 161.327 18.5437 81.2958 74.9498 21.5486C81.7981 60.7213 105.907 89.1354 144.283 95.6047L158.138 110.741 172.557 95.0814C210.092 86.5523 232.479 59.8603 237.936 21.0298L296.016 81.2958Z" />
        <path d="M158.137 53.5415 121.974 8.68323 158.137.000183751 194.3 8.68323 158.137 53.5415Z" />
      </svg>
      <b>Seametry</b>
    </Link>
  );
}
