import { describe, expect, it } from "vitest";

import { gridMove } from "../../src/ts/multiplayer/helpers";
import {
  CHARACTER_KEY,
  loadCharacter,
  saveCharacter,
} from "../../src/ts/multiplayer/character-storage";

describe("character persistence", () => {
  it("round-trips through puggie-mp-character", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    expect(CHARACTER_KEY).toBe("puggie-mp-character");
    expect(loadCharacter(storage)).toBe("puggie");
    saveCharacter("shibie", storage);
    expect(data.get("puggie-mp-character")).toBe("shibie");
    expect(loadCharacter(storage)).toBe("shibie");
  });

  it("a tampered value loads as puggie", () => {
    for (const v of ["wolf", "", "<script>", "SHIBIE"]) {
      expect(loadCharacter({ getItem: () => v })).toBe("puggie");
    }
  });

  it("uses real localStorage by default", () => {
    localStorage.removeItem(CHARACTER_KEY);
    saveCharacter("huskie");
    expect(localStorage.getItem(CHARACTER_KEY)).toBe("huskie");
    expect(loadCharacter()).toBe("huskie");
    localStorage.removeItem(CHARACTER_KEY);
  });
});

describe("gridMove (picker arrows)", () => {
  // 4×2: 0 1 2 3 / 4 5 6 7
  it.each([
    [0, "ArrowRight", 1],
    [3, "ArrowRight", 0],
    [0, "ArrowLeft", 3],
    [4, "ArrowLeft", 7],
    [1, "ArrowDown", 5],
    [5, "ArrowDown", 1],
    [6, "ArrowUp", 2],
    [2, "ArrowUp", 6],
    [5, "Home", 0],
    [2, "End", 7],
  ] as const)("4 wide: %i %s -> %i", (from, key, to) => {
    expect(gridMove(from, key, 4, 8)).toBe(to);
  });

  // 2×4: 0 1 / 2 3 / 4 5 / 6 7
  it.each([
    [1, "ArrowRight", 0],
    [0, "ArrowDown", 2],
    [6, "ArrowDown", 0],
    [1, "ArrowUp", 7],
  ] as const)("2 wide: %i %s -> %i", (from, key, to) => {
    expect(gridMove(from, key, 2, 8)).toBe(to);
  });

  it("ignores other keys", () => {
    expect(gridMove(0, "a", 4, 8)).toBeUndefined();
  });
});
