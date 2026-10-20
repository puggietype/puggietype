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

  it("no-op provider never prepares and leaves the slot untouched", async () => {
    const slot = document.createElement("div");
    expect(await noopAdProvider.prepare({ consentUi: true })).toBe(false);
    noopAdProvider.render(slot, {
      kind: "result",
      width: 728,
      height: 90,
      slotId: "x",
    });
    noopAdProvider.destroy(slot);
    expect(slot.childNodes.length).toBe(0);
  });

  it("can swap in a provider", () => {
    const provider: AdProvider = {
      name: "test",
      prepare: vi.fn(),
      render: vi.fn(),
      destroy: vi.fn(),
      openPrivacySettings: vi.fn(),
    };
    setAdProvider(provider);
    expect(getAdProvider()).toBe(provider);
  });
});
