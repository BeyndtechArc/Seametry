"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import styles from "./id.module.css";

/**
 * components.md, Id: a long identifier shown by its ends, copied whole with
 * one press, and read where it lives through an icon. The copy glyph turns
 * to a check for two seconds; no word says "copied".
 */
export function Id({ value, label, href }: { value: string; label: string; href?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);
  const shown = value.length > 16 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;

  return (
    <span className={styles.id}>
      <code title={value}>{shown}</code>
      <button type="button" className={styles.icon} aria-label={`Copy ${label}`} onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true), () => undefined)}>
        <Icon name={copied ? "check" : "copy"} />
      </button>
      {href ? (
        <a className={styles.icon} href={href} target="_blank" rel="noreferrer" aria-label={`Read ${label} on Solscan`}>
          <Icon name="external" />
        </a>
      ) : null}
    </span>
  );
}

export function solscan(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}
