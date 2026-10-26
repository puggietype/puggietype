import { describe, expect, it } from "vitest";

import {
  CARET_MEASURE_MS,
  progressFillTransform,
  shouldRemeasure,
} from "../../src/ts/multiplayer/caret-position";
import {
  shakeDuration,
  steppedShakeDuration,
} from "../../src/ts/multiplayer/opponent-dog";

const idle = {
  dirty: false,
  progressChanged: false,
  ownWordChanged: false,
  msSinceLast: 0,
};

describe("shouldRemeasure (opponent caret throttle)", () => {
  it("skips layout reads when nothing changed within the interval", () => {
    expect(shouldRemeasure(idle)).toBe(false);
    expect(
      shouldRemeasure({ ...idle, msSinceLast: CARET_MEASURE_MS - 1 }),
    ).toBe(false);
  });
  it("re-measures at the interval at the latest", () => {
    expect(CARET_MEASURE_MS).toBe(100);
    expect(shouldRemeasure({ ...idle, msSinceLast: CARET_MEASURE_MS })).toBe(
      true,
    );
    expect(shouldRemeasure({ ...idle, msSinceLast: 50 }, 40)).toBe(true);
  });
  it("re-measures right away on progress, own word change, scroll or resize", () => {
    expect(shouldRemeasure({ ...idle, progressChanged: true })).toBe(true);
    expect(shouldRemeasure({ ...idle, ownWordChanged: true })).toBe(true);
    expect(shouldRemeasure({ ...idle, dirty: true })).toBe(true);
  });
  it("measures at most ~10x/s at 60 fps when idle", () => {
    let last = 0;
    let n = 0;
    for (let t = 0; t <= 1000; t += 1000 / 60) {
      if (shouldRemeasure({ ...idle, msSinceLast: t - last })) {
        n++;
        last = t;
      }
    }
    expect(n).toBeLessThanOrEqual(11);
    expect(n).toBeGreaterThanOrEqual(9);
  });
});

describe("steppedShakeDuration", () => {
  it("is 0 (no shake) at or below 130 wpm", () => {
    expect(steppedShakeDuration(0)).toBe(0);
    expect(steppedShakeDuration(130)).toBe(0);
  });
  it("snaps to 0.05 s steps with a 0.05 s floor", () => {
    for (let wpm = 131; wpm <= 250; wpm++) {
      const d = steppedShakeDuration(wpm);
      expect(d).toBeGreaterThanOrEqual(0.05);
      expect(Math.round(d * 20) / 20).toBeCloseTo(d, 10);
      expect(Math.abs(d - shakeDuration(wpm))).toBeLessThanOrEqual(0.05);
    }
    expect(steppedShakeDuration(500)).toBe(0.05);
  });
  it("changes only a few times across the whole 130-180 wpm ramp", () => {
    const values = new Set<number>();
    for (let wpm = 130.5; wpm <= 180; wpm += 0.5) {
      values.add(steppedShakeDuration(wpm));
    }
    expect(values.size).toBeLessThanOrEqual(6);
  });
});

describe("progressFillTransform", () => {
  it("slides a full-width fill left by the missing fraction", () => {
    expect(progressFillTransform(0.1)).toBe("translateX(-90.00%)");
    expect(progressFillTransform(0.5)).toBe("translateX(-50.00%)");
    expect(progressFillTransform(0)).toBe("translateX(-100.00%)");
  });
  it("is exactly 0% at 1 (finished) and clamps bad input", () => {
    expect(progressFillTransform(1)).toBe("translateX(0%)");
    expect(progressFillTransform(1.4)).toBe("translateX(0%)");
    expect(progressFillTransform(-1)).toBe("translateX(-100.00%)");
    expect(progressFillTransform(Number.NaN)).toBe("translateX(-100.00%)");
  });
});
