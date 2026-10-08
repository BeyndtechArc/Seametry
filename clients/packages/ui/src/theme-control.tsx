"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import styles from "./components.module.css";

type ThemeName = "dark" | "light";

const storageKey = "seametry-theme-v1";

function storedTheme(): ThemeName | null {
  const value = window.localStorage.getItem(storageKey);
  return value === "dark" || value === "light" ? value : null;
}

// Light is the default, by Storm's decision on 30 September 2026, whatever
// the system preference; dark stays complete and a stored choice wins.
const publicTheme: ThemeName = "light";

export function ThemeControl({ defaultTheme = publicTheme }: { defaultTheme?: ThemeName }) {
  const [theme, setTheme] = useState<ThemeName>(defaultTheme);

  useEffect(() => {
    const initialTheme = storedTheme() ?? defaultTheme;
    document.documentElement.dataset.theme = initialTheme;
    setTheme(initialTheme);
  }, [defaultTheme]);

  function selectTheme(nextTheme: ThemeName) {
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(storageKey, nextTheme);
    setTheme(nextTheme);
  }

  const nextTheme: ThemeName = theme === "light" ? "dark" : "light";

  return (
    <button
      className={styles.themeControl}
      type="button"
      aria-label={`Use ${nextTheme} mode`}
      title={`Use ${nextTheme} mode`}
      onClick={() => selectTheme(nextTheme)}
    >
      <Icon name={nextTheme === "dark" ? "moon" : "sun"} />
    </button>
  );
}
