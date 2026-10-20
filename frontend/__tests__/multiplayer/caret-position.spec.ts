import { describe, expect, it } from "vitest";

import {
  caretTarget,
  clampTagShift,
  smoothToward,
  stackIndexes,
  stackTagLevels,
} from "../../src/ts/multiplayer/caret-position";

const words = ["the", "quick", "fox"];

describe("caretTarget", () => {
  it("points before the next letter mid-word", () => {
    expect(caretTarget(words, 1, 2)).toEqual({
      wordIndex: 1,
      letterIndex: 2,
      afterLetter: false,
    });
  });

  it("points before the first letter at the start of a word", () => {
    expect(caretTarget(words, 0, 0)).toEqual({
      wordIndex: 0,
      letterIndex: 0,
      afterLetter: false,
    });
  });

  it("points after the last letter when the word is fully typed", () => {
    expect(caretTarget(words, 0, 3)).toEqual({
      wordIndex: 0,
      letterIndex: 2,
      afterLetter: true,
    });
  });

  it("clamps charIndex to the word length", () => {
    expect(caretTarget(words, 2, 99)).toEqual({
      wordIndex: 2,
      letterIndex: 2,
      afterLetter: true,
    });
    expect(caretTarget(words, 2, -4)?.letterIndex).toBe(0);
  });

  it("clamps wordIndex past the end to the end of the last word", () => {
    expect(caretTarget(words, 3, 0)).toEqual({
      wordIndex: 2,
      letterIndex: 2,
      afterLetter: true,
    });
  });

  it("returns undefined without words", () => {
    expect(caretTarget([], 0, 0)).toBeUndefined();
  });
});

describe("smoothToward", () => {
  it("moves part of the way toward the target", () => {
    const next = smoothToward({ x: 0, y: 0 }, { x: 100, y: 0 }, 16, 80);
    expect(next.x).toBeGreaterThan(0);
    expect(next.x).toBeLessThan(100);
    expect(next.y).toBe(0);
  });

  it("snaps when switching lines", () => {
    expect(smoothToward({ x: 500, y: 0 }, { x: 0, y: 40 }, 16, 80)).toEqual({
      x: 0,
      y: 40,
    });
  });

  it("snaps when close enough", () => {
    expect(smoothToward({ x: 99.8, y: 0 }, { x: 100, y: 0 }, 16, 80)).toEqual({
      x: 100,
      y: 0,
    });
  });

  it("converges over time", () => {
    let pos = { x: 0, y: 0 };
    for (let i = 0; i < 60; i++) {
      pos = smoothToward(pos, { x: 100, y: 0 }, 16, 80);
    }
    expect(pos.x).toBe(100);
  });
});

describe("stackIndexes", () => {
  it("stacks name tags of carets on the same spot", () => {
    expect(
      stackIndexes([
        { id: "a", wordIndex: 0, charIndex: 1 },
        { id: "b", wordIndex: 0, charIndex: 1 },
        { id: "c", wordIndex: 1, charIndex: 0 },
        { id: "d", wordIndex: 0, charIndex: 1 },
      ]),
    ).toEqual({ a: 0, b: 1, c: 0, d: 2 });
  });
});

describe("stackTagLevels", () => {
  it("keeps 7 nearby tags on one line from overlapping", () => {
    const tags = Array.from({ length: 7 }, (_, i) => ({
      id: `p${i}`,
      x: 100 + i * 12,
      y: 50,
      width: 80,
    }));
    const levels = stackTagLevels(tags);
    for (const a of tags) {
      for (const b of tags) {
        if (a.id >= b.id || levels[a.id] !== levels[b.id]) continue;
        expect(a.x + a.width <= b.x || b.x + b.width <= a.x).toBe(true);
      }
    }
    expect(new Set(Object.values(levels)).size).toBeGreaterThan(1);
  });

  it("reuses level 0 for far-apart tags and separate lines", () => {
    expect(
      stackTagLevels([
        { id: "a", x: 0, y: 0, width: 50 },
        { id: "b", x: 200, y: 0, width: 50 },
        { id: "c", x: 10, y: 40, width: 50 },
      ]),
    ).toEqual({ a: 0, b: 0, c: 0 });
  });

  it("doesn't let a lower line's lifted tag hit the line above", () => {
    const levels = stackTagLevels([
      { id: "top", x: 0, y: 0, width: 80 },
      { id: "low1", x: 10, y: 40, width: 80 },
      { id: "low2", x: 20, y: 40, width: 80 },
      { id: "low3", x: 30, y: 40, width: 80 },
    ]);
    expect(levels).toEqual({ top: 0, low1: 0, low2: 1, low3: 4 });
  });

  it("hides tags beyond maxLevels", () => {
    const tags = [0, 1, 2].map((i) => ({ id: `p${i}`, x: i, y: 0, width: 60 }));
    expect(stackTagLevels(tags, 18, 16, 4, 2)).toEqual({
      p0: 0,
      p1: 1,
      p2: -1,
    });
  });
});

describe("clampTagShift", () => {
  // QM-007: 390px viewport, ~173px tag, 4px edge margin
  const maxRight = 390 - 4;

  it("leaves tags that fit unshifted", () => {
    expect(clampTagShift(100, 173, maxRight)).toBe(0);
    expect(clampTagShift(213, 173, maxRight)).toBe(0);
  });

  it("slides tags near the right edge left until they fit", () => {
    for (const left of [285, 300, 323]) {
      const shift = clampTagShift(left, 173, maxRight);
      expect(shift).toBeLessThan(0);
      expect(left + shift + 173).toBe(maxRight);
      expect(left + shift).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the left edge in bounds when the tag is wider than the space", () => {
    expect(clampTagShift(200, 400, 316)).toBe(-200);
    expect(clampTagShift(200, 400, 316, 16)).toBe(-184);
  });

  it("keeps tags inside at common widths", () => {
    for (const vw of [320, 390, 1024, 1280]) {
      for (const left of [0, vw / 2, vw - 40, vw - 2]) {
        const shift = clampTagShift(left, 173, vw - 4);
        expect(left + shift).toBeGreaterThanOrEqual(0);
        expect(left + shift + 173).toBeLessThanOrEqual(vw - 4);
      }
    }
  });
});
