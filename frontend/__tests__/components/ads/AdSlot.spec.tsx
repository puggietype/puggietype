import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ads = vi.hoisted(() => ({
  active: undefined as unknown as () => boolean,
  setActive: undefined as unknown as (v: boolean) => void,
  suppressed: undefined as unknown as () => boolean,
  setSuppressed: undefined as unknown as (v: boolean) => void,
  ready: () => false,
  prepare: vi.fn(async () => Promise.resolve(true)),
}));

vi.mock("../../../src/ts/ads/state", async () => {
  const solid = await import("solid-js");
  const [active, setActive] = solid.createSignal(false);
  const [suppressed, setSuppressed] = solid.createSignal(false);
  Object.assign(ads, { active, setActive, suppressed, setSuppressed });
  return {
    isAdsActive: () => ads.active(),
    isAdsSuppressed: () => ads.suppressed(),
    isAdsReady: () => ads.ready(),
    prepareAds: ads.prepare,
  };
});
vi.mock("../../../src/ts/states/core", () => ({
  getIsScreenshotting: () => false,
}));

import {
  AdProvider,
  noopAdProvider,
  setAdProvider,
} from "../../../src/ts/ads/provider";
import { AdSlot } from "../../../src/ts/components/ads/AdSlot";

const flush = async (): Promise<void> => {
  await new Promise((r) => setTimeout(r, 0));
};

describe("AdSlot", () => {
  let provider: AdProvider;

  beforeEach(() => {
    provider = {
      name: "test",
      prepare: vi.fn(),
      render: vi.fn((slot: HTMLElement) => {
        slot.appendChild(document.createElement("ins"));
      }),
      destroy: vi.fn((slot: HTMLElement) => slot.replaceChildren()),
      openPrivacySettings: vi.fn(),
    };
    setAdProvider(provider);
    ads.setActive(false);
    ads.setSuppressed(false);
    ads.prepare.mockClear();
  });

  afterEach(() => {
    cleanup();
    setAdProvider(noopAdProvider);
  });

  it("renders no DOM at all while ads are off", async () => {
    const { container } = render(() => <AdSlot kind="result" />);
    await flush();
    expect(container.innerHTML).toBe("");
    expect(ads.prepare).not.toHaveBeenCalled();
    expect(provider.render).not.toHaveBeenCalled();
  });

  it("reserves a labelled fixed-size box and requests one ad", async () => {
    ads.setActive(true);
    const { container } = render(() => <AdSlot kind="lobby" />);
    await flush();
    const aside = container.querySelector("aside.ptAd") as HTMLElement;
    expect(aside.getAttribute("aria-label")).toBe("Advertisement");
    expect(aside.textContent).toContain("Advertisement");
    const box = aside.querySelector(".ptAdBox") as HTMLElement;
    expect(box.className).toContain("h-[100px]");
    expect(box.className).toContain("w-[320px]");
    expect(ads.prepare).toHaveBeenCalledWith({ consentUi: true });
    expect(provider.render).toHaveBeenCalledExactlyOnceWith(box, {
      kind: "lobby",
      width: 320,
      height: 100,
      slotId: "PLACEHOLDER_SLOT_LOBBY",
    });
  });

  it("is hidden while a test or race runs and never refreshes", async () => {
    ads.setActive(true);
    const { container } = render(() => <AdSlot kind="result" />);
    await flush();
    const aside = container.querySelector("aside") as HTMLElement;
    ads.setSuppressed(true);
    expect(aside.classList.contains("hidden")).toBe(true);
    ads.setSuppressed(false);
    await flush();
    expect(aside.classList.contains("hidden")).toBe(false);
    expect(provider.render).toHaveBeenCalledOnce();
  });

  it("waits for the test to end when mounted during one", async () => {
    ads.setActive(true);
    ads.setSuppressed(true);
    render(() => <AdSlot kind="info" />);
    await flush();
    expect(provider.render).not.toHaveBeenCalled();
    ads.setSuppressed(false);
    await flush();
    expect(provider.render).toHaveBeenCalledOnce();
  });

  it("rails never show the consent message", async () => {
    ads.setActive(true);
    render(() => <AdSlot kind="rail" consentUi={false} />);
    await flush();
    expect(ads.prepare).toHaveBeenCalledWith({ consentUi: false });
  });

  it("clears the slot on unmount (a new view gets a new ad)", async () => {
    ads.setActive(true);
    const [shown, setShown] = createSignal(true);
    render(() => <>{shown() && <AdSlot kind="result" />}</>);
    await flush();
    setShown(false);
    expect(provider.destroy).toHaveBeenCalledOnce();
  });
});
