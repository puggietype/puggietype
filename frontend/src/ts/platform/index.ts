import { steamAdapter } from "./steam";
import { PlatformAdapter, PlatformName } from "./types";
import { webAdapter } from "./web";

export type { PlatformAdapter, PlatformName } from "./types";

export function selectPlatformAdapter(name: PlatformName): PlatformAdapter {
  switch (name) {
    case "steam":
      return steamAdapter;
    case "web":
      return webAdapter;
    default: {
      const unknown: never = name;
      throw new Error(`unknown platform: ${String(unknown)}`);
    }
  }
}

export function getPlatformName(): PlatformName {
  return typeof __PLATFORM__ === "undefined" ? "web" : __PLATFORM__;
}

export function getPlatform(): PlatformAdapter {
  // Compare the define inline (no helper call): vite replaces __PLATFORM__
  // with a string literal, the minifier folds the condition, and the unused
  // adapter is tree-shaken out of the other flavor's bundle. The typeof
  // guard only matters in tests, where the define may be absent.
  return typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam"
    ? steamAdapter
    : webAdapter;
}
