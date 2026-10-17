import type { Config } from "@monkeytype/schemas/configs";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ standalone: true }));
vi.mock("../../src/ts/utils/env", () => ({
  isStandalone: () => env.standalone,
}));

import {
  isCommandHidden,
  isConfigKeyHidden,
  isPaceCaretHidden,
  isRouteHidden,
  resetAccountOnlyConfig,
} from "../../src/ts/constants/standalone";
import { getDefaultConfig } from "../../src/ts/constants/default-config";

afterEach(() => {
  env.standalone = true;
});

describe("standalone visibility", () => {
  it("hides account routes but not the rest", () => {
    for (const path of [
      "/login",
      "/account",
      "/account-settings",
      "/friends",
      "/profile",
      "/profile/:uidOrName",
      "/leaderboards",
      "/verify",
    ]) {
      expect(isRouteHidden(path), path).toBe(true);
    }
    for (const path of ["/", "/race", "/r/:code", "/settings", "/about"]) {
      expect(isRouteHidden(path), path).toBe(false);
    }
  });

  it("hides account-only settings and pace caret modes", () => {
    expect(isConfigKeyHidden("showAverage")).toBe(true);
    expect(isConfigKeyHidden("showPb")).toBe(true);
    expect(isConfigKeyHidden("resultSaving")).toBe(true);
    expect(isConfigKeyHidden("paceCaret")).toBe(false);
    for (const mode of ["pb", "tagPb", "average", "daily"] as const) {
      expect(isPaceCaretHidden(mode), mode).toBe(true);
    }
    for (const mode of ["off", "last", "custom"] as const) {
      expect(isPaceCaretHidden(mode), mode).toBe(false);
    }
    expect(isCommandHidden("viewLeaderboards")).toBe(true);
    expect(isCommandHidden("viewSettings")).toBe(false);
  });

  it("hides nothing when a backend is configured", () => {
    env.standalone = false;
    expect(isRouteHidden("/login")).toBe(false);
    expect(isConfigKeyHidden("showAverage")).toBe(false);
    expect(isPaceCaretHidden("pb")).toBe(false);
    expect(isCommandHidden("viewAccount")).toBe(false);
  });
});

describe("resetAccountOnlyConfig", () => {
  it("resets account-only values left over in a stored config", () => {
    const config = {
      ...getDefaultConfig(),
      paceCaret: "pb",
      resultSaving: false,
      showAverage: "both",
      showPb: true,
      punctuation: true,
    } as Config;
    const reset = resetAccountOnlyConfig(config);
    expect(reset.paceCaret).toBe("off");
    expect(reset.resultSaving).toBe(true);
    expect(reset.showAverage).toBe("off");
    expect(reset.showPb).toBe(false);
    expect(reset.punctuation).toBe(true);
  });

  it("keeps modes that work without an account", () => {
    const config = { ...getDefaultConfig(), paceCaret: "last" } as Config;
    expect(resetAccountOnlyConfig(config).paceCaret).toBe("last");
  });

  it("keeps everything when a backend is configured", () => {
    env.standalone = false;
    const config = { ...getDefaultConfig(), paceCaret: "pb" } as Config;
    expect(resetAccountOnlyConfig(config).paceCaret).toBe("pb");
  });
});
