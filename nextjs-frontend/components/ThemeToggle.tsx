"use client";

import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";
export const THEME_KEY = "cs-theme";

function currentTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage blocked: fall through to the device setting */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Light / Dark switch. Until someone chooses, the page follows the device
 * setting (see globals.css); a choice is saved in this browser only.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => setTheme(currentTheme()), []);

  function choose(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* still applied for this visit */
    }
  }

  return (
    <div className={styles.toggle} role="group" aria-label="Theme">
      {(["light", "dark"] as const).map((t) => (
        <button key={t} type="button" aria-pressed={theme === t} onClick={() => choose(t)}>
          {t === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}
