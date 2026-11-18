import { describe, expect, it } from "vitest";

import { themes } from "../../src/ts/constants/themes";
import { AA, contrast } from "../../src/ts/multiplayer/self-highlight";
import {
  bubbleTextColor,
  dogPickColor,
  NON_TEXT,
} from "../../src/ts/multiplayer/theme-contrast";

const all = Object.entries(themes);

describe("selected dog ring + check (CharacterPicker)", () => {
  it("text alone can't be the ring: some themes have text under 3:1 on bg", () => {
    // why dogPickColor falls back to black/white instead of plain border-text
    const low = all.filter(([, t]) => contrast(t.text, t.bg) < NON_TEXT);
    expect(low.map(([n]) => n)).toContain("darling");
    for (const [, t] of low) {
      expect(["#000000", "#ffffff"]).toContain(dogPickColor(t).hex);
    }
  });

  it("uses the theme text colour wherever it reaches 3:1", () => {
    for (const [, t] of all) {
      if (contrast(t.text, t.bg) >= NON_TEXT) {
        expect(dogPickColor(t)).toEqual({
          hex: t.text,
          css: "var(--text-color)",
        });
      }
    }
  });

  it.each(all)(
    "%s: ring on the tile bg and check on the badge >= 3:1",
    (_n, t) => {
      const pick = dogPickColor(t).hex;
      // ring (border-(--dog-pick)) against the tile (bg-bg)
      expect(contrast(pick, t.bg)).toBeGreaterThanOrEqual(NON_TEXT);
      // check icon (text-bg) on the badge (bg-(--dog-pick))
      expect(contrast(t.bg, pick)).toBeGreaterThanOrEqual(NON_TEXT);
    },
  );
});

describe("quick-chat bubble text (bg-sub-alt)", () => {
  it.each(all)("%s: text and outline reach AA on sub-alt", (_n, t) => {
    expect(contrast(bubbleTextColor(t).hex, t.subAlt)).toBeGreaterThanOrEqual(
      AA,
    );
  });

  it("keeps the theme text colour where it already reads", () => {
    for (const [, t] of all) {
      if (contrast(t.text, t.subAlt) >= AA) {
        expect(bubbleTextColor(t).css).toBe("var(--text-color)");
      }
    }
  });
});
