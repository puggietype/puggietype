import { browserStorage, browserWindow } from "./browser";
import { PlatformAdapter } from "./types";

/**
 * M1 stub for the steam flavor. No Steamworks SDK: M2 adds the Electron
 * shell, M3 wires Steam OpenID sign-in and server-side ownership checks.
 */
export const steamAdapter: PlatformAdapter = {
  name: "steam",
  adsAllowed: false,
  storage: browserStorage,
  window: browserWindow,
  input: { hasControllerSupport: () => false },
  identity: { kind: "steam-openid", isAvailable: () => false },
  entitlements: { getOwned: async () => [] },
};
