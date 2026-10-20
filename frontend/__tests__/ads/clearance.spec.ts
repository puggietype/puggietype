import { describe, expect, it } from "vitest";

import { boxDistance, minClearance } from "../../src/ts/ads/clearance";

const box = (
  left: number,
  top: number,
  width: number,
  height: number,
): { left: number; top: number; right: number; bottom: number } => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe("ad clearance", () => {
  it("measures the horizontal gap between side-by-side boxes", () => {
    expect(boxDistance(box(0, 0, 160, 600), box(310, 100, 50, 50))).toBe(150);
  });
  it("is 0 for overlapping boxes", () => {
    expect(boxDistance(box(0, 0, 100, 100), box(50, 50, 100, 100))).toBe(0);
  });
  it("measures diagonal gaps", () => {
    expect(boxDistance(box(0, 0, 10, 10), box(40, 50, 10, 10))).toBe(50);
  });
  it("ignores empty (hidden) boxes", () => {
    const ad = box(0, 0, 160, 600);
    expect(minClearance(ad, [box(170, 0, 0, 0)])).toBe(Infinity);
    expect(minClearance(ad, [box(170, 0, 0, 0), box(400, 0, 10, 10)])).toBe(
      240,
    );
  });
});
