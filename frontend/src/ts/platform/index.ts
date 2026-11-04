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
  // direct define check so the bundler drops the other flavor's adapter
  return getPlatformName() === "steam" ? steamAdapter : webAdapter;
}
