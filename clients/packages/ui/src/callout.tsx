import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import styles from "./callout.module.css";

export type CalloutTone = "note" | "caution" | "blocked" | "done";

const glyphs: Record<CalloutTone, IconName> = { note: "info", caution: "info", blocked: "close", done: "check" };

/**
 * components.md, Callout: a fact the reader must weigh before going on, set
 * apart from body text so its gravity reads before its words. A full-height
 * icon cell on the left carries the tone; the title and sentence fill the
 * rest of the line; one action may follow. A problem the user just caused
 * is announced (role alert); a standing condition is a note.
 */
export function Callout({ tone = "note", title, children, action, announce = false }: { tone?: CalloutTone; title?: string; children: ReactNode; action?: ReactNode; announce?: boolean }) {
  return (
    <div className={styles.callout} data-tone={tone} role={announce ? "alert" : "note"}>
      <span className={styles.mark} aria-hidden="true"><Icon name={glyphs[tone]} /></span>
      <div className={styles.body}>
        {title ? <b>{title}</b> : null}
        <div className={styles.text}>{children}</div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  );
}
