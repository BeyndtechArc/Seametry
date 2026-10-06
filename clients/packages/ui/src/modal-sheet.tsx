"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icons";
import styles from "./modal-sheet.module.css";

/** The native dialog contract both surfaces share: modal open, Escape, and focus back to the opener. */
function useNativeDialog(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

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

  const dialogProps = {
    ref: dialogRef,
    onCancel: (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      onClose();
    },
    onClose: () => {
      if (open) onClose();
      returnFocusRef.current?.focus();
    },
  };
  return { dialogProps, close: () => dialogRef.current?.close() };
}

export type ModalSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  register?: string;
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** components.md, Modal sheet: an end sheet for a task the user works in. */
export function ModalSheet({
  open,
  onClose,
  title,
  register = "Focused review",
  closeLabel = "Close sheet",
  children,
  footer,
}: ModalSheetProps) {
  const { dialogProps, close } = useNativeDialog(open, onClose);
  const titleId = useId();

  return (
    <dialog {...dialogProps} className={styles.dialog} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div>
          <span>{register}</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button className={styles.close} type="button" onClick={close}>
          {closeLabel}
        </button>
      </header>
      <div className={styles.body}>{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </dialog>
  );
}

/** components.md, Process dialog: a centred dialog for watching a request the user started. */
export function ProcessDialog({
  open,
  onClose,
  title,
  register,
  closeLabel,
  children,
  footer,
}: Omit<ModalSheetProps, "register" | "closeLabel"> & { register: string; closeLabel: string }) {
  const { dialogProps, close } = useNativeDialog(open, onClose);
  const titleId = useId();

  return (
    <dialog {...dialogProps} className={styles.process} aria-labelledby={titleId}>
      <header className={styles.processHeader}>
        <div>
          <span>{register}</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button className={styles.iconClose} type="button" onClick={close} aria-label={closeLabel}>
          <Icon name="close" />
        </button>
      </header>
      <div className={styles.processBody}>{children}</div>
      {footer ? <footer className={styles.processFooter}>{footer}</footer> : null}
    </dialog>
  );
}
