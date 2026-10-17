import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdProvider,
  getAdProvider,
  noopAdProvider,
  setAdProvider,
} from "../../src/ts/ads/provider";

describe("ad provider", () => {
  afterEach(() => setAdProvider(noopAdProvider));

  it("defaults to the no-op provider", () => {
    expect(getAdProvider()).toBe(noopAdProvider);
    expect(noopAdProvider.name).toBe("none");
  });

  it("no-op provider leaves the slot untouched", async () => {
    const slot = document.createElement("div");
    await noopAdProvider.renderResult(slot);
    noopAdProvider.destroyResult(slot);
    expect(slot.childNodes.length).toBe(0);
  });

  it("can swap in a provider", () => {
    const provider: AdProvider = {
      name: "test",
      renderResult: vi.fn(),
      destroyResult: vi.fn(),
    };
    setAdProvider(provider);
    expect(getAdProvider()).toBe(provider);
  });
});
