import { describe, expect, it } from "vitest";

import {
  advanced,
  MAX_PAW_FPS,
  MIN_PAW_FPS,
  nextPaw,
  opponentFrame,
  pawIntervalMs,
  pawSequence,
  shakeDuration,
} from "../../src/ts/multiplayer/opponent-dog";

const base = {
  finished: false,
  connected: true,
  typing: true,
  paw: "left" as const,
  reducedMotion: false,
};

describe("opponent dog", () => {
  it("advanced: forward moves only", () => {
    expect(advanced(undefined, { wordIndex: 0, charIndex: 0 })).toBe(false);
    expect(advanced(undefined, { wordIndex: 0, charIndex: 2 })).toBe(true);
    const at = { wordIndex: 3, charIndex: 2 };
    expect(advanced(at, { wordIndex: 3, charIndex: 3 })).toBe(true);
    expect(advanced(at, { wordIndex: 4, charIndex: 0 })).toBe(true);
    expect(advanced(at, { wordIndex: 3, charIndex: 2 })).toBe(false);
    // backspace is not typing forward
    expect(advanced(at, { wordIndex: 3, charIndex: 1 })).toBe(false);
    expect(advanced(at, { wordIndex: 2, charIndex: 5 })).toBe(false);
  });

  it("paws alternate left/right from idle", () => {
    expect(nextPaw("idle")).toBe("left");
    expect(nextPaw("left")).toBe("right");
    expect(nextPaw("right")).toBe("left");
  });

  it("pawSequence: deltas -> alternating paws, still ticks go idle", () => {
    expect(pawSequence([1, 2, 1, 0, 3, 1], false)).toEqual([
      "left",
      "right",
      "left",
      "idle",
      "left",
      "right",
    ]);
    expect(pawSequence([0, 0], false)).toEqual(["idle", "idle"]);
    expect(pawSequence([-1, 1], false)).toEqual(["idle", "left"]);
  });

  it("pawSequence: reduced motion is always idle", () => {
    expect(pawSequence([1, 2, 3, 4], true)).toEqual([
      "idle",
      "idle",
      "idle",
      "idle",
    ]);
  });

  it("paw rate follows wpm, clamped to 2..8 fps", () => {
    expect(pawIntervalMs(0)).toBe(1000 / MIN_PAW_FPS);
    expect(pawIntervalMs(60)).toBe(200); // 5 chars/s
    expect(pawIntervalMs(300)).toBe(1000 / MAX_PAW_FPS);
    expect(pawIntervalMs(80)).toBeLessThan(pawIntervalMs(40));
  });

  it("frame: finished > disconnected/still/reduced > paw", () => {
    expect(opponentFrame(base)).toBe("left");
    expect(opponentFrame({ ...base, finished: true })).toBe("winnerSmall");
    expect(opponentFrame({ ...base, connected: false })).toBe("idle");
    expect(opponentFrame({ ...base, typing: false })).toBe("idle");
    expect(opponentFrame({ ...base, reducedMotion: true })).toBe("idle");
    expect(
      opponentFrame({ ...base, reducedMotion: true, finished: true }),
    ).toBe("winnerSmall");
  });

  it("head bob only above 130 wpm, faster with speed", () => {
    expect(shakeDuration(100)).toBe(0);
    expect(shakeDuration(130)).toBe(0);
    expect(shakeDuration(140)).toBeGreaterThan(shakeDuration(170));
    expect(shakeDuration(500)).toBeCloseTo(0.01);
  });
});
