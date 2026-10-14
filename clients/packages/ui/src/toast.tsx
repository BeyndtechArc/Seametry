"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { StatusMark, type MarkState } from "./timeline";
import styles from "./toast.module.css";

/** components.md, Toast: the corner where requests the user started report back, newest nearest the edge. */
export function ToastRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={styles.region} aria-label={label} aria-live="polite">
      {children}
    </section>
  );
}

/**
 * One request's state in a sentence. The body opens its full record; the
 * next step, when there is one, is an icon at the right beside dismiss. A
 * finished toast carries a countdown bar; when the bar runs out the toast
 * leaves, so the bar's duration (motion.duration.linger) is the only clock,
 * and pointing at the toast holds it. A toast never holds the only copy of
 * anything: its record stays in Activity.
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
  countdown = false,
}: {
  state: MarkState;
  lead?: ReactNode;
  title: string;
  line: string;
  /** An icon link or button for the one next step, sized by the toast. */
  action?: ReactNode;
  onOpen: () => void;
  openLabel: string;
  onDismiss: () => void;
  dismissLabel: string;
  countdown?: boolean;
}) {
  const [leaving, setLeaving] = useState(false);
  const leave = () => setLeaving(true);
  return (
    <article
      className={styles.toast}
      data-state={state}
      data-leaving={leaving || undefined}
      role={state === "stopped" ? "alert" : "status"}
      onTransitionEnd={(event) => { if (leaving && event.target === event.currentTarget && event.propertyName === "opacity") onDismiss(); }}
    >
      <button type="button" className={styles.open} onClick={onOpen} aria-label={openLabel}>
        <StatusMark state={state} size="compact" />
        <span className={styles.text}>
          <b>{title}</b>
          <span>{line}</span>
        </span>
        {lead ? <span className={styles.lead}>{lead}</span> : null}
      </button>
      <div className={styles.controls}>
        {action ? <span className={styles.action}>{action}</span> : null}
        <button type="button" className={styles.dismiss} onClick={leave} aria-label={dismissLabel}>
          <Icon name="close" />
        </button>
      </div>
      {countdown && !leaving ? <span className={styles.countdown} aria-hidden="true" onAnimationEnd={leave} /> : null}
    </article>
  );
}
