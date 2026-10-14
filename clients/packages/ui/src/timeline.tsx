import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import styles from "./timeline.module.css";

export type MarkState = "waiting" | "running" | "done" | "stopped" | "partial";

const marks: Record<Exclude<MarkState, "waiting">, IconName> = { running: "running", done: "check", stopped: "close", partial: "partial" };
const words: Record<MarkState, string> = { waiting: "Waiting", running: "Running", done: "Done", stopped: "Stopped", partial: "Partly done" };

/**
 * components.md, Status mark: the one glyph every process surface uses for
 * where a thing stands. Only "running" moves (foundations.md, the spinner
 * exception: a request the user started and is waiting on).
 */
export function StatusMark({ state, glyph = "info", size = "row" }: { state: MarkState; glyph?: IconName; size?: "row" | "compact" }) {
  return (
    <span className={styles.mark} data-state={state} data-size={size}>
      <Icon name={state === "waiting" ? glyph : marks[state]} />
      <span className={styles.srOnly}>{words[state]}</span>
    </span>
  );
}

/** components.md, Timeline: ordered events, each with its mark, a title, a time or figure at the right, and detail below. */
export function Timeline({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ol className={styles.timeline} aria-label={label}>
      {children}
    </ol>
  );
}

export function TimelineItem({
  state,
  glyph,
  title,
  meta,
  children,
}: {
  state: MarkState;
  glyph?: IconName;
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className={styles.item} data-state={state}>
      <StatusMark state={state} glyph={glyph} />
      <div className={styles.body}>
        <div className={styles.head}>
          <b>{title}</b>
          {meta ? <span className={styles.meta}>{meta}</span> : null}
        </div>
        {children ? <div className={styles.detail}>{children}</div> : null}
      </div>
    </li>
  );
}
