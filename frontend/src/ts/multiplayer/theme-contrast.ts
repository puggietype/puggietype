import type { Theme } from "../constants/themes";

import { AA, contrast } from "./self-highlight";

/** WCAG 1.4.11 non-text contrast (rings, icons that carry meaning) */
export const NON_TEXT = 3;

/** a computed colour: `hex` for the maths, `css` for the style var */
export type ThemePick = { hex: string; css: string };

function blackOrWhite(on: string): ThemePick {
  return contrast("#000000", on) >= contrast("#ffffff", on)
    ? { hex: "#000000", css: "#000" }
    : { hex: "#ffffff", css: "#fff" };
}

/**
 * The selected dog's ring and check badge (ring on the tile's bg, badge =
 * this colour with a bg-coloured check): the theme text colour when it reaches
 * 3:1 on bg, else black/white. Some themes put text and bg within 3:1
 * (darling, frozen_llama, ...), so text alone can't be the ring.
 */
export function dogPickColor(c: Pick<Theme, "bg" | "text">): ThemePick {
  return contrast(c.text, c.bg) >= NON_TEXT
    ? { hex: c.text, css: "var(--text-color)" }
    : blackOrWhite(c.bg);
}

/**
 * Text and outline of a quick-chat bubble on bg-sub-alt: the theme text
 * colour when it reaches AA there, else black/white.
 */
export function bubbleTextColor(c: Pick<Theme, "subAlt" | "text">): ThemePick {
  return contrast(c.text, c.subAlt) >= AA
    ? { hex: c.text, css: "var(--text-color)" }
    : blackOrWhite(c.subAlt);
}
