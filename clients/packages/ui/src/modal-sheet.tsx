"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./modal-sheet.module.css";

export type ModalSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  register?: string;
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function ModalSheet({
  open,
  onClose,
  title,
  register = "Focused review",
  closeLabel = "Close sheet",
  children,
  footer,
}: ModalSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
        returnFocusRef.current?.focus();
      }}
    >
      <header className={styles.header}>
        <div>
          <span>{register}</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button className={styles.close} type="button" onClick={() => dialogRef.current?.close()}>
          {closeLabel}
        </button>
      </header>
      <div className={styles.body}>{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </dialog>
  );
}
