"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { ProcessDialog } from "./modal-sheet";
import styles from "./components.module.css";

/**
 * components.md, Key, blocked: it reads as unavailable but still answers a
 * press. A dead button that explains nothing was the complaint (Storm,
 * 13 October 2026), so the press opens a dialog naming the reason and,
 * where there is one, the way to resolve it.
 */
export function BlockedKey({ children, reason, title, resolve, reasonBeside = true }: { children: ReactNode; reason: string; title: string; resolve?: (close: () => void) => ReactNode; reasonBeside?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <span className={styles.keyGroup}>
      <span className={styles.keyTray}>
        <button type="button" className={styles.key} aria-disabled="true" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <span className={styles.actionLabel}>{children}</span>
          <span className={styles.actionIcon}><Icon name="key" /></span>
        </button>
      </span>
      {reasonBeside ? <span className={styles.controlReason}>{reason}</span> : null}
      {open ? (
        <ProcessDialog open onClose={close} title={title} register="Not available yet" closeLabel="Close" footer={resolve?.(close)}>
          <p>{reason}</p>
        </ProcessDialog>
      ) : null}
    </span>
  );
}
