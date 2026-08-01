"use client";

import { useEffect, useSyncExternalStore } from "react";

type Mode = "system" | "light" | "dark";
const ORDER: Mode[] = ["system", "light", "dark"];
const LABEL: Record<Mode, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};
const STORAGE_KEY = "novakore-theme";

const listeners = new Set<() => void>();

function readMode(): Mode {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function applyMode(mode: Mode) {
  if (mode === "system") {
    delete document.documentElement.dataset.theme;
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    document.documentElement.dataset.theme = mode;
    window.localStorage.setItem(STORAGE_KEY, mode);
  }
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** Cycles system → light → dark. Persists locally; system preference is the default. */
export function ThemeToggle() {
  const mode = useSyncExternalStore(
    subscribe,
    readMode,
    () => "system" as Mode,
  );

  // DOM-only sync of a stored preference on mount (no state updates).
  useEffect(() => {
    const stored = readMode();
    if (stored !== "system") {
      document.documentElement.dataset.theme = stored;
    }
  }, []);

  const cycle = () => {
    applyMode(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      className="nk-press rounded-md border border-border-default px-2.5 py-1.5 text-xs font-medium text-text-muted hover:border-border-strong hover:text-text-primary"
      aria-label={`Theme: ${LABEL[mode]}. Activate to change.`}
    >
      {LABEL[mode]}
    </button>
  );
}
