import { afterEach, describe, expect, it, vi } from "vitest";

const standalone = vi.hoisted(() => ({ value: true }));
vi.mock("../../src/ts/utils/env", () => ({
  isStandalone: () => standalone.value,
  isDevEnvironment: () => true,
}));
import {
  getPlatform,
  getPlatformName,
  selectPlatformAdapter,
} from "../../src/ts/platform";
import { PLATFORM_NAMES } from "../../src/ts/platform/types";
import { webAdapter } from "../../src/ts/platform/web";
import { steamAdapter } from "../../src/ts/platform/steam";
import {
  AdProvider,
  getAdProvider,
  noopAdProvider,
  setAdProvider,
} from "../../src/ts/ads/provider";

describe("platform adapter selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAdProvider(noopAdProvider);
  });

  it("selects the web adapter for web", () => {
    expect(selectPlatformAdapter("web")).toBe(webAdapter);
  });

  it("selects the steam adapter for steam", () => {
    expect(selectPlatformAdapter("steam")).toBe(steamAdapter);
  });

  it("throws on an unknown platform", () => {
    expect(() => selectPlatformAdapter("xbox" as never)).toThrow(
      "unknown platform",
    );
  });

  it("defaults to web in tests and when __PLATFORM__ is web", () => {
    expect(getPlatformName()).toBe("web");
    expect(getPlatform()).toBe(webAdapter);
  });

  it("follows the build-time __PLATFORM__ define", () => {
    vi.stubGlobal("__PLATFORM__", "steam");
    expect(getPlatformName()).toBe("steam");
    expect(getPlatform()).toBe(steamAdapter);
  });

  it("every platform name maps to an adapter with that name", () => {
    for (const name of PLATFORM_NAMES) {
      expect(selectPlatformAdapter(name).name).toBe(name);
    }
  });

  it("web sign-in is available only with a backend", () => {
    standalone.value = true;
    expect(webAdapter.identity.isAvailable()).toBe(false);
    standalone.value = false;
    expect(webAdapter.identity.isAvailable()).toBe(true);
    standalone.value = true;
  });

  it("web keeps current behavior: ads allowed, firebase identity", async () => {
    expect(webAdapter.adsAllowed).toBe(true);
    expect(webAdapter.identity.kind).toBe("firebase");
    await expect(webAdapter.entitlements.getOwned()).resolves.toEqual([]);
  });

  it("steam stub: no ads, steam-openid identity not yet available", async () => {
    expect(steamAdapter.adsAllowed).toBe(false);
    expect(steamAdapter.identity.kind).toBe("steam-openid");
    expect(steamAdapter.identity.isAvailable()).toBe(false);
    await expect(steamAdapter.entitlements.getOwned()).resolves.toEqual([]);
  });

  it("storage round-trips through localStorage", () => {
    webAdapter.storage.setItem("pt-platform-test", "1");
    expect(window.localStorage.getItem("pt-platform-test")).toBe("1");
    expect(steamAdapter.storage.getItem("pt-platform-test")).toBe("1");
    webAdapter.storage.removeItem("pt-platform-test");
    expect(webAdapter.storage.getItem("pt-platform-test")).toBeNull();
  });

  it("steam flavor forces the no-op ad provider", () => {
    const fake: AdProvider = {
      name: "fake",
      renderResult: () => undefined,
      destroyResult: () => undefined,
    };
    setAdProvider(fake);
    expect(getAdProvider()).toBe(fake);
    vi.stubGlobal("__PLATFORM__", "steam");
    expect(getAdProvider()).toBe(noopAdProvider);
  });
});
