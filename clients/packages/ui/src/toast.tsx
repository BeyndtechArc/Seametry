import type { ReactNode } from "react";
import { Icon } from "./icons";
import { StatusMark, type MarkState } from "./timeline";
import styles from "./toast.module.css";

/** components.md, Toast: the corner where requests the user started report back, newest at the bottom. */
export function ToastRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={styles.region} aria-label={label} aria-live="polite">
      {children}
    </section>
  );
}

/**
 * One request's state in a sentence. The body opens its full record; the
 * action, when there is one, is the single next thing to do; dismissing is
 * an icon. A toast never holds the only copy of anything: its record stays
 * in Activity.
 */
export function Toast({
  state,
  lead,
  title,
  line,
  action,
  onOpen,
  openLabel,
  onDismiss,
  dismissLabel,
}: {
  state: MarkState;
  lead?: ReactNode;
  title: string;
  line: string;
  action?: ReactNode;
  onOpen: () => void;
  openLabel: string;
  onDismiss: () => void;
  dismissLabel: string;
}) {
  return (
    <article className={styles.toast} data-state={state} role={state === "stopped" ? "alert" : "status"}>
      <button type="button" className={styles.open} onClick={onOpen} aria-label={openLabel}>
        <StatusMark state={state} size="compact" />
        <span className={styles.text}>
          <b>{title}</b>
          <span>{line}</span>
        </span>
        {lead ? <span className={styles.lead}>{lead}</span> : null}
      </button>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label={dismissLabel}>
        <Icon name="close" />
      </button>
      {action ? <div className={styles.action}>{action}</div> : null}
    </article>
  );
}
