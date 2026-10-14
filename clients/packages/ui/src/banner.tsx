import type { ReactNode } from "react";
import { Icon } from "./icons";
import styles from "./banner.module.css";

/**
 * components.md, Banner: a condition of the whole page, in one line, with
 * what to do about it. Not a Callout, which states a fact inside the content:
 * a Banner says why the page cannot do its job yet (no wallet, purchases
 * closed) and carries the one action that fixes it, when the reader can.
 */
export function Banner({ tone = "note", children, action }: { tone?: "note" | "blocked"; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.banner} data-tone={tone} role="status">
      <span className={styles.mark} aria-hidden="true"><Icon name={tone === "blocked" ? "close" : "info"} /></span>
      <p className={styles.text}>{children}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
