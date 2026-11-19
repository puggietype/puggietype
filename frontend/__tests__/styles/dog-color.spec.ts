import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.join(__dirname, "../../src");
const read = (p: string): string => readFileSync(path.join(src, p), "utf-8");

/** custom properties declared in every `<selector> { ... }` block (flat scss only) */
function props(scss: string, selector: string): Map<string, string> {
  const out = new Map<string, string>();
  const clean = scss.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = (block[1] ?? "").trim().replace(/\s+/g, " ");
    if (sel !== selector) continue;
    for (const d of (block[2] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out.set(d[1] as string, (d[2] as string).trim().toLowerCase());
    }
  }
  return out;
}

const MONO = ':root[data-pug="mono"]';
const DOG_COLOR = ':root[data-pug="mono"] .dog-color';

describe(".dog-color (styles/character-color.scss)", () => {
  const monoTokens = [
    ...props(read("styles/character-mono.scss"), MONO).keys(),
    ...props(read("styles/pug-mono.scss"), MONO).keys(),
  ];
  const reset = props(read("styles/character-color.scss"), DOG_COLOR);
  const defaults = props(read("styles/core.scss"), ":root");

  it("finds the mono overrides", () => {
    expect(monoTokens.length).toBeGreaterThan(20);
    expect(monoTokens).toContain("--pug-fill");
    expect(monoTokens).toContain("--chow-fill");
  });

  it("puts back every token the mono theme overrides", () => {
    const missing = monoTokens.filter((t) => !reset.has(t));
    expect(missing).toEqual([]);
  });

  it("resets to the core.scss default, or to `initial` (the art's own fallback)", () => {
    for (const t of monoTokens) {
      const v = reset.get(t);
      const d = defaults.get(t);
      if (d !== undefined) expect([t, v]).toEqual([t, d.toLowerCase()]);
      else expect([t, v]).toEqual([t, "initial"]);
    }
  });

  it("is imported after character-mono and pug-mono, in the same layer", () => {
    const index = read("styles/index.scss");
    const layer = /@layer custom-styles \{\s*@import([^;]+);/.exec(index)?.[1];
    const order = (layer ?? "").match(/"[\w-]+"/g)?.map((x) => x.slice(1, -1));
    expect(order).toBeDefined();
    const at = (n: string): number => order?.indexOf(n) ?? -1;
    expect(at("character-color")).toBeGreaterThan(at("character-mono"));
    expect(at("character-color")).toBeGreaterThan(at("pug-mono"));
    expect(at("character-mono")).toBeGreaterThanOrEqual(0);
  });

  it("goes on every multiplayer dog, never on the typing mascot", () => {
    expect(read("ts/multiplayer/components/CharacterImage.tsx")).toMatch(
      /cn\(\s*"dog-color /,
    );
    expect(read("ts/multiplayer/components/OpponentDogs.tsx")).toContain(
      '"dog-color ',
    );
    // the solo/race typing mascot stays mono in mono themes
    expect(read("ts/components/pages/test/Pug.tsx")).not.toContain("dog-color");
  });
});
