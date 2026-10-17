import { describe, expect, it } from "vitest";

import {
  computeClockOffset,
  countdownSeconds,
} from "../../src/ts/multiplayer/clock";

describe("computeClockOffset", () => {
  it("returns 0 without samples", () => {
    expect(computeClockOffset([])).toBe(0);
  });

  it("uses rtt/2 to estimate the server time at receive", () => {
    // sent at 1000, server stamped 6050, received at 1100 -> rtt 100, offset 5000
    expect(
      computeClockOffset([{ sentAt: 1000, serverNow: 6050, receivedAt: 1100 }]),
    ).toBe(5000);
  });

  it("picks the sample with the median rtt", () => {
    const samples = [
      { sentAt: 0, serverNow: 9999, receivedAt: 900 }, // rtt 900, outlier
      { sentAt: 0, serverNow: 1020, receivedAt: 40 }, // rtt 40 -> 1000
      { sentAt: 0, serverNow: 1030, receivedAt: 60 }, // rtt 60 -> 1000 (median)
      { sentAt: 0, serverNow: 1040, receivedAt: 80 }, // rtt 80 -> 1000
      { sentAt: 0, serverNow: 5000, receivedAt: 20 }, // rtt 20, skewed
    ];
    expect(computeClockOffset(samples)).toBe(1000);
  });

  it("ignores samples with a negative rtt", () => {
    expect(
      computeClockOffset([
        { sentAt: 100, serverNow: 0, receivedAt: 50 },
        { sentAt: 0, serverNow: 1010, receivedAt: 20 },
      ]),
    ).toBe(1000);
  });
});

describe("countdownSeconds", () => {
  it("counts down in whole seconds, rounding up", () => {
    expect(countdownSeconds(1000, 4000)).toBe(3);
    expect(countdownSeconds(1001, 4000)).toBe(3);
    expect(countdownSeconds(2999, 4000)).toBe(2);
    expect(countdownSeconds(3500, 4000)).toBe(1);
  });

  it("is 0 at and after start", () => {
    expect(countdownSeconds(4000, 4000)).toBe(0);
    expect(countdownSeconds(5000, 4000)).toBe(0);
  });
});
