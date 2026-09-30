"use client";

import { useEffect, useState } from "react";
import styles from "./components.module.css";

type ThemeName = "dark" | "light";

const storageKey = "seametry-theme-v1";

function storedTheme(): ThemeName | null {
  const value = window.localStorage.getItem(storageKey);
  return value === "dark" || value === "light" ? value : null;
}

// Light is the default, by Storm's decision on 30 September 2026, whatever
// the system preference; dark stays complete and a stored choice wins.
const defaultTheme: ThemeName = "light";

export function ThemeControl() {
  const [theme, setTheme] = useState<ThemeName>(defaultTheme);

  useEffect(() => {
    const initialTheme = storedTheme() ?? defaultTheme;
    document.documentElement.dataset.theme = initialTheme;
    setTheme(initialTheme);
  }, []);

  function selectTheme(nextTheme: ThemeName) {
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(storageKey, nextTheme);
    setTheme(nextTheme);
  }

  return (
    <div className={styles.themeControl} role="group" aria-label="Colour mode">
      {(["dark", "light"] as const).map((mode) => (
        <button
          className={styles.themeChoice}
          type="button"
          key={mode}
          aria-label={`Use ${mode} mode`}
          aria-pressed={theme === mode}
          onClick={() => selectTheme(mode)}
        >
          <span aria-hidden="true" />
          {mode === "dark" ? "Dark" : "Light"}
        </button>
      ))}
    </div>
  );
}
