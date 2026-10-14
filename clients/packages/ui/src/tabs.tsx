"use client";

import { useRef, type KeyboardEvent } from "react";
import styles from "./tabs.module.css";

export type TabItem<T extends string> = { value: T; label: string; count?: number };

/**
 * components.md, Tabs: views of the same subject, one underlined. A count
 * beside a label is the number that view holds. Arrow keys move between tabs,
 * as the ARIA tabs pattern expects. A control that changes a value rather
 * than the view is a Segmented control, not Tabs.
 */
export function Tabs<T extends string>({ label, items, value, onChange, controls }: { label: string; items: TabItem<T>[]; value: T; onChange: (next: T) => void; controls?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + items.length) % items.length;
    onChange(items[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.value}
          ref={(element) => { refs.current[index] = element; }}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          aria-controls={controls}
          tabIndex={item.value === value ? 0 : -1}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => move(event, index)}
        >
          {item.label}
          {item.count !== undefined ? <span className={styles.count}>{item.count.toLocaleString()}</span> : null}
        </button>
      ))}
    </div>
  );
}
