import { describe, expect, it, vi } from "vitest";

const suppressAdsNow = vi.hoisted(() => vi.fn());
vi.mock("../../src/ts/ads/state", () => ({ suppressAdsNow }));

import { onTestOrRaceStart } from "../../src/ts/controllers/ad-controller";

describe("ad-controller", () => {
  it("hides every ad slot synchronously on test or race start", () => {
    onTestOrRaceStart();
    expect(suppressAdsNow).toHaveBeenCalledOnce();
  });
});
