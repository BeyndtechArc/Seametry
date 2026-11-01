"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import { Icon } from "./icons";
import { darkQuery, themeColor, themeStorageKey } from "./theme-boot";
import styles from "./components.module.css";

import type { ThemeName } from "./theme-boot";

export type { ThemeName };
export type ThemePreference = ThemeName | "system";

const changeEvent = "seametry-theme-change";

// Light is the public default and the product opens dark, by Storm's decision
// on 30 September 2026, whatever the system preference; "System" is an
// explicit choice that follows it. A stored choice always wins.
const publicTheme: ThemeName = "light";

function readPreference(): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(themeStorageKey);
    return value === "dark" || value === "light" || value === "system" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): ThemeName {
  return window.matchMedia(darkQuery).matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(darkQuery);
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onChange);
  };
}

// One string snapshot, so useSyncExternalStore compares by value.
const clientSnapshot = () => `${readPreference() ?? ""}:${systemTheme()}`;
const serverSnapshot = () => "";

function useTheme(defaultTheme: ThemeName) {
  const snapshot = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const [stored, system] = snapshot.split(":") as [ThemePreference | "", ThemeName | undefined];
  const preference: ThemePreference | null = stored || null;
  const resolved: ThemeName = preference === "system" ? (system ?? defaultTheme) : (preference ?? defaultTheme);

  useEffect(() => {
    if (!snapshot) return;
    const root = document.documentElement;
    if (root.dataset.theme !== resolved) root.dataset.theme = resolved;
    // Next may stream the viewport meta more than once; every copy follows.
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", themeColor[resolved]);
  }, [snapshot, resolved]);

  return { preference, resolved, hydrated: Boolean(snapshot) };
}

function choose(preference: ThemePreference) {
  window.localStorage.setItem(themeStorageKey, preference);
  window.dispatchEvent(new Event(changeEvent));
}

/** The one-tap switch between light and dark, for headers and rails. */
export function ThemeControl({ defaultTheme = publicTheme }: { defaultTheme?: ThemeName }) {
  const { resolved } = useTheme(defaultTheme);
  const nextTheme: ThemeName = resolved === "light" ? "dark" : "light";

  return (
    <button
      className={styles.themeControl}
      type="button"
      aria-label={`Use ${nextTheme} mode`}
      title={`Use ${nextTheme} mode`}
      onClick={() => choose(nextTheme)}
    >
      <Icon name={nextTheme === "dark" ? "moon" : "sun"} />
    </button>
  );
}

const choices: Array<{ value: ThemePreference; label: string; icon: "sun" | "moon" | "system" }> = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "system" },
];

/** Light, dark or the system's, for footers and menus. */
export function ThemeChoice({ defaultTheme = publicTheme, className }: { defaultTheme?: ThemeName; className?: string }) {
  const { preference, resolved, hydrated } = useTheme(defaultTheme);
  const selected: ThemePreference | null = hydrated ? (preference ?? resolved) : null;
  const name = useId();

  return (
    <div role="radiogroup" aria-label="Theme" className={[styles.themeChoice, className].filter(Boolean).join(" ")}>
      {choices.map((choice) => (
        <label key={choice.value} className={styles.themeOption} title={`${choice.label} theme`}>
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={selected === choice.value}
            onChange={() => choose(choice.value)}
          />
          <Icon name={choice.icon} />
          <span>{choice.label}</span>
        </label>
      ))}
    </div>
  );
}
