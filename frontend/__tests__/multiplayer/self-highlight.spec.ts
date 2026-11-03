import { describe, expect, it } from "vitest";

import { themes } from "../../src/ts/constants/themes";
import {
  AA,
  contrast,
  selfPillText,
  selfTintPercent,
  tintOver,
} from "../../src/ts/multiplayer/self-highlight";

const pillFg = (t: (typeof themes)[keyof typeof themes]): string => {
  const fg = selfPillText(t);
  if (fg === "var(--bg-color)") return t.bg;
  if (fg === "var(--text-color)") return t.text;
  return fg === "#000" ? "#000000" : "#ffffff";
};

describe("self highlight contrast", () => {
  it("contrast matches WCAG reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("tintOver mixes main into the base", () => {
    expect(
      tintOver(
        { bg: "#000000", main: "#ffffff", subAlt: "#000000", text: "#fff" },
        "#000000",
        50,
      ),
    ).toBe("#808080");
  });

  it("serika dark gets the full 12% tint and a bg-on-main pill", () => {
    expect(selfTintPercent(themes.serika_dark)).toBe(12);
    expect(selfPillText(themes.serika_dark)).toBe("var(--bg-color)");
  });

  it("serika (light, yellow main) pill falls back to the text color", () => {
    expect(selfPillText(themes.serika)).toBe("var(--text-color)");
  });

  it.each(Object.entries(themes))(
    "%s: tinted row and placed line keep text AA, pill AA",
    (_name, t) => {
      const pct = selfTintPercent(t);
      for (const base of [t.subAlt, t.bg]) {
        const before = contrast(t.text, base);
        const after = contrast(t.text, tintOver(t, base, pct));
        if (before >= AA) expect(after).toBeGreaterThanOrEqual(AA);
        else expect(after).toBeGreaterThanOrEqual(before - 0.1);
      }
      expect(contrast(pillFg(t), t.main)).toBeGreaterThanOrEqual(AA);
    },
  );
});
