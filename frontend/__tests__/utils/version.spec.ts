import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  isDevelopment: false,
  clientVersion: "2026.10.17_12.00_abc1234",
}));
vi.mock("virtual:env-config", () => ({ envConfig: env }));

import { getBuildVersion } from "../../src/ts/utils/version";

describe("getBuildVersion", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns the static build version without any network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(getBuildVersion()).toEqual({
      text: "2026.10.17_12.00_abc1234",
      isNew: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("flags a version change since the last visit", () => {
    getBuildVersion();
    env.clientVersion = "2026.10.18_12.00_def5678";
    expect(getBuildVersion()?.isNew).toBe(true);
    expect(getBuildVersion()?.isNew).toBe(false);
  });

  it("returns null in development", () => {
    env.isDevelopment = true;
    expect(getBuildVersion()).toBeNull();
    env.isDevelopment = false;
  });
});
