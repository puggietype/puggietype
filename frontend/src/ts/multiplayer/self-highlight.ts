import type { Theme } from "../constants/themes";

import { blendTwoHexColors, hexToRgb } from "../utils/colors";

type Colors = Pick<Theme, "bg" | "main" | "subAlt" | "text">;

/** WCAG AA for normal text */
export const AA = 4.5;
/** main-color tint steps tried for your own row, strongest first */
const TINTS = [12, 10, 8, 6, 4, 2] as const;

function luminance(hex: string): number {
  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two opaque hex colors */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** what `color-mix(in srgb, main pct%, transparent)` looks like over base */
export function tintOver(c: Colors, base: string, pct: number): string {
  return blendTwoHexColors(base, c.main, pct / 100).slice(0, 7);
}

/**
 * Strongest tint (percent of --main-color) that keeps text readable on both
 * the results table (sub-alt) and the "you placed" line (bg): >= 4.5:1, or for
 * themes already under AA, no more than a hair below their own contrast.
 * 0 (no tint; the bar, bold name and pill still mark the row) if none fit.
 */
export function selfTintPercent(c: Colors): number {
  const ok = (base: string, pct: number): boolean => {
    const before = contrast(c.text, base);
    const after = contrast(c.text, tintOver(c, base, pct));
    return after >= AA || (before < AA && after >= before - 0.1);
  };
  return TINTS.find((pct) => ok(c.subAlt, pct) && ok(c.bg, pct)) ?? 0;
}

/**
 * Text color for the main-color "You" pill: the theme bg when it reads (the
 * usual look), else the theme text color, else plain black/white.
 */
export function selfPillText(c: Colors): string {
  if (contrast(c.bg, c.main) >= AA) return "var(--bg-color)";
  if (contrast(c.text, c.main) >= AA) return "var(--text-color)";
  return contrast("#000000", c.main) >= contrast("#ffffff", c.main)
    ? "#000"
    : "#fff";
}
