import { describe, expect, it } from "vitest";

import {
  CARET_MEASURE_MS,
  progressFillTransform,
  shouldRemeasure,
} from "../../src/ts/multiplayer/caret-position";
import {
  nextShake,
  shakeDuration,
  steppedShakeDuration,
  type ShakeState,
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

/** shake step after each tick of [wpm, testMs] */
function shakeSteps(ticks: readonly (readonly [number, number])[]): number[] {
  let st: ShakeState | undefined;
  return ticks.map(([wpm, ms]) => {
    st = nextShake(st, wpm, ms);
    return st.duration;
  });
}

/** 10 Hz ticks with +-30 ms timing jitter, deterministic */
function ticks(
  fromMs: number,
  count: number,
  wpmAt: (i: number) => number,
): [number, number][] {
  return Array.from({ length: count }, (_, i) => [
    wpmAt(i),
    fromMs + i * 100 + ((i * 37) % 61) - 30,
  ]);
}

describe("nextShake (smoothed shake step)", () => {
  it("keeps a steady 250 wpm opponent on one step despite dips", () => {
    // like the prod flake: single/double ticks dipping to 165 and 150 wpm
    const dips: Record<number, number> = { 5: 165, 12: 150, 13: 165, 21: 150 };
    const input = ticks(500, 40, (i) => dips[i] ?? 250);
    const raw = new Set(input.map(([wpm]) => steppedShakeDuration(wpm)));
    expect(raw).toEqual(new Set([0.05, 0.1, 0.15]));
    expect(new Set(shakeSteps(input))).toEqual(new Set([0.05]));
  });
  it("doesn't flicker when the wpm hovers on a step boundary", () => {
    // 156 wpm sits on the 0.1/0.15 s edge; the raw step flips every tick
    const input = ticks(3000, 40, (i) => (i % 2 ? 159 : 153));
    expect(new Set(input.map(([w]) => steppedShakeDuration(w))).size).toBe(2);
    const steps = shakeSteps(input);
    expect(new Set(steps).size).toBe(1);
  });
  it("follows a sustained slowdown within ~2 s", () => {
    const input = [...ticks(500, 20, () => 250), ...ticks(2500, 30, () => 150)];
    const steps = shakeSteps(input);
    expect(steps[19]).toBe(0.05);
    const at = steps.findIndex((d, i) => i >= 20 && d === 0.15);
    expect(at).toBeGreaterThan(20);
    expect((input[at]?.[1] ?? Infinity) - 2500).toBeLessThanOrEqual(2000);
    expect(steps.at(-1)).toBe(steppedShakeDuration(150));
  });
  it("follows a sustained speed-up within ~2 s", () => {
    const input = [...ticks(500, 20, () => 140), ...ticks(2500, 30, () => 250)];
    const steps = shakeSteps(input);
    expect(steps[19]).toBe(steppedShakeDuration(140));
    const at = steps.findIndex((d, i) => i >= 20 && d === 0.05);
    expect((input[at]?.[1] ?? Infinity) - 2500).toBeLessThanOrEqual(2000);
  });
  it("starts from the raw step and restarts when testMs goes back", () => {
    expect(nextShake(undefined, 250, 100).duration).toBe(0.05);
    const prev = nextShake(undefined, 250, 5000);
    expect(nextShake(prev, 0, 100)).toEqual({
      wpm: 0,
      testMs: 100,
      duration: 0,
    });
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
