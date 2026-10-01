import type { CSSProperties } from "react";

/**
 * Sizes an input to show its hint (placeholder) in full. Without this a text
 * box is about 20 characters wide whatever its hint, so long hints are cut
 * off and short ones waste space. `ch` is the width of a "0", about the
 * width of an average letter; capitals (an input styled uppercase shows its
 * hint in capitals) run wider. `minChars` keeps room for what's typed when
 * the hint is a single short word. In a flex row the input can still grow
 * past this; it never shrinks below it, so the row wraps instead.
 */
export function hintWidth(
  hint: string,
  { uppercase = false, minChars = 0 } = {}
): CSSProperties {
  const chars = Math.max(hint.length * (uppercase ? 1.25 : 1), minChars);
  const width = `calc(${chars}ch + 26px)`;
  return { width, minWidth: width };
}
