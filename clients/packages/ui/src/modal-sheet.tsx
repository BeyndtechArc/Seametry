"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icons";
import styles from "./modal-sheet.module.css";

/** The longest transition on the element, in milliseconds, read from its computed style. */
function transitionMs(element: Element) {
  const style = getComputedStyle(element);
  const seconds = (list: string) => list.split(",").map((part) => (part.trim().endsWith("ms") ? parseFloat(part) / 1000 : parseFloat(part)) || 0);
  const durations = seconds(style.transitionDuration);
  const delays = seconds(style.transitionDelay);
  return Math.max(0, ...durations.map((duration, index) => (duration + (delays[index] ?? 0)) * 1000));
}

/**
 * The native dialog contract both surfaces share: modal open, Escape, focus
 * back to the opener, and an exit as deliberate as the entry. Closing marks
 * the dialog data-closing so its CSS plays the arrival backwards, and only
 * when that transition ends is the dialog closed; a timer at the same
 * length stands in if no transition runs.
 */
function useNativeDialog(open: boolean, onClose: () => void, onClosed?: () => void) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.removeAttribute("data-closing");
      if (!dialog.open) {
        returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
      }
      return;
    }
    if (!dialog.open) return;
    dialog.setAttribute("data-closing", "");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      dialog.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      dialog.removeAttribute("data-closing");
      dialog.close();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === dialog) finish();
    };
    dialog.addEventListener("transitionend", onEnd);
    const timer = setTimeout(finish, transitionMs(dialog) + 50);
    return () => {
      dialog.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
    };
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
      // After the exit, the page is no longer inert, so a caller can move
      // focus somewhere other than the opener here.
      onClosed?.();
    },
  };
  return { dialogProps, close: onClose };
}

export type ModalSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  register?: string;
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Runs once the exit has finished and the page behind is interactive again. */
  onClosed?: () => void;
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
  onClosed,
}: ModalSheetProps) {
  const { dialogProps, close } = useNativeDialog(open, onClose, onClosed);
  const titleId = useId();

  return (
    <dialog {...dialogProps} className={styles.dialog} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div>
          <span>{register}</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button className={styles.iconClose} type="button" onClick={close} aria-label={closeLabel}>
          <Icon name="close" />
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
  onClosed,
}: Omit<ModalSheetProps, "register" | "closeLabel"> & { register: string; closeLabel: string }) {
  const { dialogProps, close } = useNativeDialog(open, onClose, onClosed);
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

export function ProcessOutcome({ kind, title, children }: { kind: "pending" | "success" | "error"; title: string; children: ReactNode }) {
  return (
    <section className={styles.outcome} data-kind={kind} role={kind === "error" ? "alert" : "status"}>
      <span className={styles.outcomeMark} aria-hidden="true"><Icon name={kind === "success" ? "check" : kind === "error" ? "close" : "info"} /></span>
      <div className={styles.outcomeBody}><h3>{title}</h3>{children}</div>
    </section>
  );
}

export type AuthDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title. */
  lead?: ReactNode;
  /** The product mark above the title, decorative. */
  mark?: ReactNode;
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClosed?: () => void;
};

/**
 * components.md, Auth dialog: the one centred form for signing in or
 * connecting, a full-width sheet from the bottom on a phone. It shares the
 * native dialog contract (focus containment, Escape, return of focus) with
 * ModalSheet and ProcessDialog.
 */
export function AuthDialog({ open, onClose, title, lead, mark, closeLabel = "Close", children, footer, onClosed }: AuthDialogProps) {
  const { dialogProps, close } = useNativeDialog(open, onClose, onClosed);
  const titleId = useId();
  const leadId = useId();

  return (
    <dialog {...dialogProps} className={styles.auth} aria-labelledby={titleId} aria-describedby={lead ? leadId : undefined}>
      <button className={`${styles.iconClose} ${styles.authClose}`} type="button" onClick={close} aria-label={closeLabel}>
        <Icon name="close" />
      </button>
      <header className={styles.authHeader}>
        {mark ? <span className={styles.authMark} aria-hidden="true">{mark}</span> : null}
        <h2 id={titleId}>{title}</h2>
        {lead ? <p id={leadId}>{lead}</p> : null}
      </header>
      <div className={styles.authBody}>{children}</div>
      {footer ? <footer className={styles.authFooter}>{footer}</footer> : null}
    </dialog>
  );
}
