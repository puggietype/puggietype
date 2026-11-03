import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { themes } from "../../src/ts/constants/themes";
import {
  AA,
  contrast,
  DEFAULT_PLAYER_COLORS,
  PLAYER_COLOR_VARS,
  playerColorsFor,
  rowFg,
  selfHighlight,
  selfPillText,
  selfTintPercent,
  THEME_PLAYER_COLORS,
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
        expect(after).toBeGreaterThanOrEqual(Math.min(AA, before) - 1e-9);
      }
      expect(contrast(pillFg(t), t.main)).toBeGreaterThanOrEqual(AA);
    },
  );

  // SH-01: every color on your own row, every theme, vs the untinted row
  const ROOT = join(__dirname, "../..");
  const oppsIn = (css: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const m of css.matchAll(/--(opp[1-8]):\s*(#[0-9a-fA-F]{6})/g)) {
      out[m[1] as string] = (m[2] as string).toLowerCase();
    }
    return out;
  };

  it("player color table matches core.scss and every theme css", () => {
    const core = oppsIn(
      readFileSync(join(ROOT, "src/styles/core.scss"), "utf8"),
    );
    expect(core).toEqual(DEFAULT_PLAYER_COLORS);
    const dir = join(ROOT, "static/themes");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".css"))) {
      const name = f.replace(/\.css$/, "");
      const own = oppsIn(readFileSync(join(dir, f), "utf8"));
      expect({ name, colors: playerColorsFor(name) }).toEqual({
        name,
        colors: { ...DEFAULT_PLAYER_COLORS, ...own },
      });
      if (Object.keys(own).length > 0) {
        expect(THEME_PLAYER_COLORS[name]).toBeDefined();
      }
    }
  });

  it.each(Object.entries(themes))(
    "%s: every color on your tinted row is AA or no worse than untinted",
    (name, t) => {
      const hl = selfHighlight(t, name);
      const opps = playerColorsFor(name);
      const row: [string, string, boolean][] = [
        ["text", t.text, false],
        ["sub", t.sub, hl.subToText],
        ["error", t.error, hl.errorToText],
        ...PLAYER_COLOR_VARS.map(
          (k) =>
            [k, opps[k], hl.playerToText.has(k)] as [string, string, boolean],
        ),
      ];
      const tinted = tintOver(t, t.subAlt, hl.pct);
      for (const [label, color, toText] of row) {
        const shown = toText ? t.text : color;
        const before = contrast(color, t.subAlt);
        const after = contrast(shown, tinted);
        expect({ label, ok: after >= Math.min(AA, before) - 1e-9 }).toEqual({
          label,
          ok: true,
        });
        expect(rowFg(t, color, t.subAlt, hl.pct).ratio).toBeCloseTo(after, 9);
      }
      // placed line on bg: text only
      const pb = contrast(t.text, t.bg);
      expect(
        contrast(t.text, tintOver(t, t.bg, hl.pct)),
      ).toBeGreaterThanOrEqual(Math.min(AA, pb) - 1e-9);
    },
  );

  it("QA SH-01 themes: raw (sub) and rank are AA on your row", () => {
    for (const name of [
      "puggie_dark",
      "puggie_light",
      "serika_dark",
      "dracula",
      "midnight_chow",
    ] as const) {
      const t = themes[name];
      const hl = selfHighlight(t, name);
      const bg = tintOver(t, t.subAlt, hl.pct);
      const raw = hl.subToText ? t.text : t.sub;
      expect({ name, raw: contrast(raw, bg) >= AA }).toEqual({
        name,
        raw: true,
      });
      const opps = playerColorsFor(name);
      for (const k of PLAYER_COLOR_VARS) {
        const c = hl.playerToText.has(k) ? t.text : opps[k];
        expect({ name, k, ok: contrast(c, bg) >= AA }).toEqual({
          name,
          k,
          ok: true,
        });
      }
    }
  });

  it("selfTintPercent with no extra colors still only checks text", () => {
    expect(selfTintPercent(themes.serika_dark)).toBe(12);
  });
});
