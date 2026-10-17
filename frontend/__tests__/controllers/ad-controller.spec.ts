import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ ads: "off" as string }));
vi.mock("../../src/ts/config/store", () => ({ Config: config }));

import {
  destroyResult,
  renderResult,
} from "../../src/ts/controllers/ad-controller";
import {
  AdProvider,
  noopAdProvider,
  setAdProvider,
} from "../../src/ts/ads/provider";

describe("ad-controller", () => {
  let provider: AdProvider;
  let slot: HTMLElement;

  beforeEach(() => {
    provider = { name: "test", renderResult: vi.fn(), destroyResult: vi.fn() };
    setAdProvider(provider);
    slot = document.createElement("div");
    slot.id = "ad-result";
    document.body.appendChild(slot);
  });

  afterEach(() => {
    setAdProvider(noopAdProvider);
    slot.remove();
    config.ads = "off";
  });

  it("does not render when ads are off", async () => {
    await renderResult();
    expect(provider.renderResult).not.toHaveBeenCalled();
  });

  it.each(["result", "on", "sellout"])(
    "renders only into the result slot when ads are %s",
    async (value) => {
      config.ads = value;
      await renderResult();
      expect(provider.renderResult).toHaveBeenCalledExactlyOnceWith(slot);
    },
  );

  it("skips rendering when the result slot is missing", async () => {
    config.ads = "result";
    slot.remove();
    await renderResult();
    expect(provider.renderResult).not.toHaveBeenCalled();
  });

  it("destroys the result slot via the provider", () => {
    destroyResult();
    expect(provider.destroyResult).toHaveBeenCalledExactlyOnceWith(slot);
  });
});
