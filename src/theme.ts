export type ThemeMode = "light" | "dark" | "system";

const KEY = "roc-theme-mode";

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // Storage unavailable: fall back to following the system.
  }
  return "system";
}

/** "system" removes the override so the OS preference (via CSS) decides. */
export function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

export function setThemeMode(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    // Still applies for this session.
  }
  applyThemeMode(mode);
}
