import { describe, expect, it } from "vitest";

import {
  caretTarget,
  smoothToward,
  stackIndexes,
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
