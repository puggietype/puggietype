import { describe, expect, it } from "vitest";

import {
  FAST_MAX_WPM,
  FAST_MIN_WPM,
  getHalfFrameMs,
  getPugHeat,
  getPugSpeed,
  getShakeDuration,
  isSteaming,
} from "../../../../src/ts/components/pages/test/pug-fast";

describe("pug-fast trigger", () => {
  it("keeps Monkeytype's 130-180 wpm window", () => {
    expect(FAST_MIN_WPM).toBe(130);
    expect(FAST_MAX_WPM).toBe(180);
  });

  it("uses wpm, or raw in blind mode", () => {
    expect(getPugSpeed({ wpm: 140, raw: 160 }, false)).toBe(140);
    expect(getPugSpeed({ wpm: 140, raw: 160 }, true)).toBe(160);
    expect(getPugSpeed({}, false)).toBe(0);
  });

  it.each([
    [0, 0],
    [129, 0],
    [130, 0],
    [155, 0.5],
    [180, 1],
    [250, 1],
  ])("heat at %i wpm is %f", (wpm, heat) => {
    expect(getPugHeat(wpm)).toBeCloseTo(heat, 5);
  });

  it("treats NaN or infinite speed as cold", () => {
    expect(getPugHeat(Number.NaN)).toBe(0);
    expect(getShakeDuration(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("does not shake at or below 130 wpm, like Monkeytype", () => {
    expect(getShakeDuration(100)).toBe(0);
    expect(getShakeDuration(130)).toBe(0);
  });

  it("shakes faster as speed rises, down to 0.01s", () => {
    expect(getShakeDuration(155)).toBeCloseTo(0.13, 5);
    expect(getShakeDuration(180)).toBeCloseTo(0.01, 5);
    expect(getShakeDuration(300)).toBeCloseTo(0.01, 5);
    expect(getShakeDuration(170)).toBeLessThan(getShakeDuration(140));
  });

  it("shortens the half-paw frame as heat rises", () => {
    expect(getHalfFrameMs(0)).toBe(45);
    expect(getHalfFrameMs(1)).toBe(22);
    expect(getHalfFrameMs(0.5)).toBe(34);
    expect(getHalfFrameMs(-1)).toBe(45);
    expect(getHalfFrameMs(5)).toBe(22);
    expect(getHalfFrameMs(Number.NaN)).toBe(45);
  });

  it("only steams once visibly warm", () => {
    expect(isSteaming(0)).toBe(false);
    expect(isSteaming(0.1)).toBe(false);
    expect(isSteaming(getPugHeat(140))).toBe(true);
    expect(isSteaming(1)).toBe(true);
  });
});
