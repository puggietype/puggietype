import { describe, expect, it, vi } from "vitest";

import {
  ADS_BUILD_ENABLED,
  fetchAdsSwitch,
  isAdsKilledByFlags,
  parseAdsSwitch,
} from "../../src/ts/ads/gate";

function storage(value: string | null): Pick<Storage, "getItem"> {
  return { getItem: () => value };
}

describe("ads gate", () => {
  it("is off without VITE_ADS_ENABLED", () => {
    expect(ADS_BUILD_ENABLED).toBe(false);
  });

  describe("isAdsKilledByFlags", () => {
    it("?flags=none turns ads off", () => {
      expect(isAdsKilledByFlags("?flags=none", storage(null))).toBe(true);
      expect(isAdsKilledByFlags("?flags=%20none%20", storage(null))).toBe(true);
    });
    it("a stored ?flags=none from earlier in the tab turns ads off", () => {
      expect(isAdsKilledByFlags("", storage("none"))).toBe(true);
    });
    it("no other ?flags= value affects ads", () => {
      for (const search of ["", "?flags=ads", "?flags=default", "?ads=on"]) {
        expect(isAdsKilledByFlags(search, storage(null))).toBe(false);
      }
      expect(isAdsKilledByFlags("?flags=quickMatch", storage("none"))).toBe(
        false,
      );
    });
    it("survives blocked storage", () => {
      const blocked = {
        getItem: () => {
          throw new Error("blocked");
        },
      };
      expect(isAdsKilledByFlags("", blocked)).toBe(false);
    });
  });

  describe("parseAdsSwitch", () => {
    it("only a literal true turns ads on", () => {
      expect(parseAdsSwitch({ ads: true })).toBe(true);
      for (const body of [
        { ads: false },
        { ads: "true" },
        { ads: 1 },
        {},
        null,
        "ads",
        [true],
      ]) {
        expect(parseAdsSwitch(body)).toBe(false);
      }
    });
  });

  describe("fetchAdsSwitch", () => {
    const respond = (body: unknown, ok = true): typeof fetch =>
      vi.fn(async () =>
        Promise.resolve({
          ok,
          json: async () => Promise.resolve(body),
        } as Response),
      );

    it("reads /config.json without the cache", async () => {
      const fetchFn = respond({ ads: true });
      expect(await fetchAdsSwitch(fetchFn)).toBe(true);
      expect(fetchFn).toHaveBeenCalledWith("/config.json", {
        cache: "no-store",
      });
    });
    it("is off for the committed default, errors and bad responses", async () => {
      expect(await fetchAdsSwitch(respond({ ads: false }))).toBe(false);
      expect(await fetchAdsSwitch(respond({ ads: true }, false))).toBe(false);
      const failing = vi.fn(async () => Promise.reject(new Error("offline")));
      expect(await fetchAdsSwitch(failing)).toBe(false);
    });
  });
});
