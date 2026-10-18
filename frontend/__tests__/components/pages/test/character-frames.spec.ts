import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CHARACTER_FRAME_FILES,
  CHARACTERS,
  characterLabel,
  getCharacterFrameUrl,
  HEAD_VIEWBOX,
  toCharacter,
  toHeadSvg,
} from "../../../../src/ts/components/pages/test/character-frames";
import { getPugFrameUrl } from "../../../../src/ts/components/pages/test/pug-frames";

const STATIC = join(__dirname, "../../../../static");

describe("character-frames", () => {
  it("has the 8 dogs of the protocol enum", () => {
    expect(CHARACTERS).toEqual([
      "puggie",
      "chowie",
      "frenchie",
      "tuckie",
      "huskie",
      "corgie",
      "shibie",
      "goldie",
    ]);
  });

  it("maps frames to /images/characters/<id>/<id>-<frame>.svg", () => {
    expect(getCharacterFrameUrl("chowie", "left")).toBe(
      "/images/characters/chowie/chowie-left-paw-down.svg",
    );
    expect(getCharacterFrameUrl("goldie", "winnerSmall")).toBe(
      "/images/characters/goldie/goldie-winner-small.svg",
    );
    expect(getCharacterFrameUrl("puggie", "rightHalf")).toBe(
      "/images/characters/puggie/puggie-right-paw-half.svg",
    );
    // heads are cropped from the idle file at runtime
    expect(getCharacterFrameUrl("tuckie", "head")).toBe(
      "/images/characters/tuckie/tuckie-idle.svg",
    );
  });

  it("every mapped file exists for every dog, plus its head", () => {
    for (const c of CHARACTERS) {
      for (const f of Object.keys(CHARACTER_FRAME_FILES) as Array<
        keyof typeof CHARACTER_FRAME_FILES
      >) {
        const url = getCharacterFrameUrl(c, f);
        expect(existsSync(join(STATIC, url)), url).toBe(true);
      }
      const head = join(STATIC, `images/characters/${c}/${c}-head.svg`);
      expect(readFileSync(head, "utf8")).toContain(`viewBox="${HEAD_VIEWBOX}"`);
    }
  });

  it("keeps the legacy /images/pug frames", () => {
    expect(existsSync(join(STATIC, getPugFrameUrl("idle")))).toBe(true);
  });

  it("labels read 'Name, breed'", () => {
    expect(characterLabel("chowie")).toBe("Chowie, chow chow");
    expect(characterLabel("frenchie")).toBe("Frenchie, French bulldog");
  });

  it("unknown ids fall back to puggie", () => {
    expect(toCharacter("corgie")).toBe("corgie");
    for (const bad of ["cat", "", null, undefined, 3, "Chowie"]) {
      expect(toCharacter(bad)).toBe("puggie");
    }
  });

  it("toHeadSvg swaps only the root viewBox", () => {
    const svg =
      '<svg viewBox="0 0 512 512"><svg viewBox="1 2 3 4"></svg></svg>';
    expect(toHeadSvg(svg)).toBe(
      `<svg viewBox="${HEAD_VIEWBOX}"><svg viewBox="1 2 3 4"></svg></svg>`,
    );
  });
});
