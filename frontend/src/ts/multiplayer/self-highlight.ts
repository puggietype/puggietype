import type { Theme } from "../constants/themes";

import { blendTwoHexColors, hexToRgb } from "../utils/colors";

type Colors = Pick<Theme, "bg" | "main" | "subAlt" | "text">;

export const PLAYER_COLOR_VARS = [
  "opp1",
  "opp2",
  "opp3",
  "opp4",
  "opp5",
  "opp6",
  "opp7",
  "opp8",
] as const;

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

/** what a row color ends up as on your tinted row: itself, or the text color if that reads better */
export function rowFg(
  c: Colors,
  color: string,
  base: string,
  pct: number,
): { useText: boolean; ratio: number } {
  const bg = tintOver(c, base, pct);
  const own = contrast(color, bg);
  const txt = contrast(c.text, bg);
  // fall back only when the color misses AA and the text color reads better
  return own < AA && txt > own
    ? { useText: true, ratio: txt }
    : { useText: false, ratio: own };
}

/**
 * Strongest tint (percent of --main-color) for your own row and "you placed"
 * line such that every color shown there (text, plus `rowColors`: sub, error,
 * player colors) reads at >= 4.5:1 on the tinted background, or, for a color
 * already under AA untinted, no worse than its own untinted contrast. A color
 * that misses AA is drawn in the text color when that reads better (see
 * rowFg/selfRowFallbacks). 0 (no tint; bar, bold name and pill still mark
 * the row) if no tint fits.
 */
export function selfTintPercent(
  c: Colors,
  rowColors: readonly string[] = [],
): number {
  const ok = (base: string, pct: number): boolean => {
    for (const color of [c.text, ...rowColors]) {
      const before = rowFg(c, color, base, 0).ratio;
      const after = rowFg(c, color, base, pct).ratio;
      if (after < Math.min(AA, before)) return false;
    }
    return true;
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

export type PlayerColorVar = (typeof PLAYER_COLOR_VARS)[number];

/** --opp1..8 from src/styles/core.scss (used by every theme without its own) */
export const DEFAULT_PLAYER_COLORS: Record<PlayerColorVar, string> = {
  opp1: "#5db7ee",
  opp2: "#3dbe9a",
  opp3: "#c58bd9",
  opp4: "#e6d85c",
  opp5: "#f0a35e",
  opp6: "#ef7fa6",
  opp7: "#9bd35a",
  opp8: "#ee6f6f",
};

/** themes whose static/themes/<name>.css overrides --opp1..8 (a spec keeps this in sync) */
export const THEME_PLAYER_COLORS: Partial<
  Record<string, Record<PlayerColorVar, string>>
> = {
  puggie_dark: DEFAULT_PLAYER_COLORS,
  puggie_light: {
    opp1: "#1f69a8",
    opp2: "#11795a",
    opp3: "#8a479f",
    opp4: "#76680a",
    opp5: "#a8520c",
    opp6: "#b0346a",
    opp7: "#4a7a10",
    opp8: "#b42f2f",
  },
  midnight_chow: {
    opp1: "#7cc6f2",
    opp2: "#4fd1a8",
    opp3: "#d49be6",
    opp4: "#ddeb72",
    opp5: "#f5b072",
    opp6: "#f590b5",
    opp7: "#aee06c",
    opp8: "#f38282",
  },
};

export function playerColorsFor(
  themeName: string,
): Record<PlayerColorVar, string> {
  return THEME_PLAYER_COLORS[themeName] ?? DEFAULT_PLAYER_COLORS;
}

type RowTheme = Colors & Pick<Theme, "sub" | "error">;

/** every color that can appear on your own row besides text: sub, error and all 8 player colors */
export function selfRowColors(t: RowTheme, themeName: string): string[] {
  return [t.sub, t.error, ...Object.values(playerColorsFor(themeName))];
}

/** tint + which colors fall back to text, for the current theme */
export function selfHighlight(
  t: RowTheme,
  themeName: string,
): {
  pct: number;
  subToText: boolean;
  errorToText: boolean;
  playerToText: Set<PlayerColorVar>;
} {
  const colors = selfRowColors(t, themeName);
  const pct = selfTintPercent(t, colors);
  const fb = (color: string): boolean => rowFg(t, color, t.subAlt, pct).useText;
  const pc = playerColorsFor(themeName);
  return {
    pct,
    subToText: fb(t.sub),
    errorToText: fb(t.error),
    playerToText: new Set(PLAYER_COLOR_VARS.filter((k) => fb(pc[k]))),
  };
}
