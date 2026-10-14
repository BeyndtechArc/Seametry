import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { Icon } from "./icons";
import { LotMarkImage } from "./lot-mark-image";
import styles from "./list.module.css";

/**
 * components.md, List: one grammar for every register of rows. A bordered
 * plate, a quiet column head, divided rows, each row one target with a
 * trailing icon. The page names its columns once through `className`
 * (a grid-template-columns); rows take them by subgrid, so heads and cells
 * line up without the page styling either.
 */
export function List({ label, head, className, children }: { label: string; head?: ReactNode[]; className?: string; children: ReactNode }) {
  return (
    <div className={[styles.list, className].filter(Boolean).join(" ")} role="list" aria-label={label}>
      {head ? (
        <div className={styles.head} aria-hidden="true">
          {head.map((cell, index) => <span key={index}>{cell}</span>)}
          <span />
        </div>
      ) : null}
      {children}
    </div>
  );
}

type Anchor = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;

/**
 * A row is one target. With `href` it goes somewhere: the whole row is the
 * link, and `link` is the app's own (next/link), so moving between records
 * does not reload the page; this package cannot import it. With `onSelect`
 * it opens something on this page, such as a sheet, and `label` names that.
 */
export function ListRow(props: { href: string; link?: Anchor; children: ReactNode } | { onSelect: () => void; label: string; children: ReactNode }) {
  const trailing = <span className={styles.trailing} aria-hidden="true"><Icon name="next" /></span>;
  if ("onSelect" in props) {
    return (
      <div role="listitem" className={styles.item}>
        <button type="button" className={styles.row} onClick={props.onSelect} aria-label={props.label}>
          {props.children}
          {trailing}
        </button>
      </div>
    );
  }
  const Link = props.link ?? ("a" as unknown as Anchor);
  return (
    <div role="listitem" className={styles.item}>
      <Link className={styles.row} href={props.href}>
        {props.children}
        {trailing}
      </Link>
    </div>
  );
}

/** A cell that hides below the tablet breakpoint, where a row keeps its identity and one value. */
export function ListCell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <span className={wide ? styles.wideOnly : styles.cell}>{children}</span>;
}

/**
 * components.md, Identity: who an instrument is in one glance. The mark is
 * never shorter than the text beside it: 40px beside two lines. The issuer,
 * when shown, is its own quiet line, never part of the name.
 */
export function Identity({ symbol, name, logo, issuer }: { symbol: string; name?: string; logo?: string; issuer?: string }) {
  return (
    <span className={styles.identity}>
      <LotMarkImage symbol={symbol} src={logo} size="list" />
      <span className={styles.identityText}>
        <b>{symbol}</b>
        <small>{[name, issuer].filter(Boolean).join(" · ") || "No name in the mint's metadata"}</small>
      </span>
    </span>
  );
}
