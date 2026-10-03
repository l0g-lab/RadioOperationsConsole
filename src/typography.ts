/**
 * The interface font and text size (display-preferences.md, PREF-040,
 * PREF-041). Remembered on this computer, like the theme, and applied before
 * the first screen is drawn. Text size scales text only; Ctrl+Shift +/−
 * zooms everything.
 */

export type FontChoice = "system" | "hyperlegible" | "wide";
export type TextSize = "small" | "normal" | "large" | "xlarge";

export const FONT_CHOICES: Record<FontChoice, { label: string; stack: string }> = {
  system: { label: "System default", stack: '"Segoe UI", system-ui, -apple-system, sans-serif' },
  // Bundled with the app (no download), so it's there offline.
  hyperlegible: {
    label: "Atkinson Hyperlegible",
    stack: '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif',
  },
  // Already installed: Verdana on Windows, DejaVu Sans on most Linux.
  wide: { label: "Wide (Verdana / DejaVu Sans)", stack: 'Verdana, "DejaVu Sans", "Bitstream Vera Sans", sans-serif' },
};

export const TEXT_SIZES: Record<TextSize, { label: string; scale: number }> = {
  small: { label: "Small", scale: 0.9 },
  normal: { label: "Normal", scale: 1 },
  large: { label: "Large", scale: 1.15 },
  xlarge: { label: "Extra large", scale: 1.3 },
};

const FONT_KEY = "roc-font";
const SIZE_KEY = "roc-text-size";

function read<T extends string>(key: string, allowed: Record<T, unknown>, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && v in allowed) return v as T;
  } catch {
    // Storage unavailable: use the default.
  }
  return fallback;
}

function write(key: string, value: string, isDefault: boolean) {
  try {
    if (isDefault) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Still applies for this session.
  }
}

export const getFontChoice = (): FontChoice => read(FONT_KEY, FONT_CHOICES, "system");
export const getTextSize = (): TextSize => read(SIZE_KEY, TEXT_SIZES, "normal");

/** Puts both into effect through CSS variables (styles.css). */
export function applyTypography(font: FontChoice = getFontChoice(), size: TextSize = getTextSize()) {
  const root = document.documentElement.style;
  root.setProperty("--font-body", FONT_CHOICES[font].stack);
  root.setProperty("--font-scale", String(TEXT_SIZES[size].scale));
}

export function setFontChoice(font: FontChoice) {
  write(FONT_KEY, font, font === "system");
  applyTypography(font, getTextSize());
}

export function setTextSize(size: TextSize) {
  write(SIZE_KEY, size, size === "normal");
  applyTypography(getFontChoice(), size);
}
