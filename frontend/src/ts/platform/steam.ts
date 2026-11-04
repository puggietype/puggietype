import { browserStorage, browserWindow } from "./browser";
import { bridgeWindow, getDesktopBridge } from "./desktop-bridge";
import { PlatformAdapter } from "./types";

/**
 * Steam flavor. No Steamworks SDK: the Electron shell (desktop/) exposes
 * fullscreen and storage through a contextBridge preload. Without the shell
 * (e.g. the steam build opened in a browser) it falls back to browser APIs.
 * Sign-in is Steam OpenID through the shell (see steam-identity.ts); the
 * server verifies it and checks ownership (CheckAppOwnership).
 */
export const steamAdapter: PlatformAdapter = {
  name: "steam",
  adsAllowed: false,
  storage: {
    getItem: (key) =>
      (getDesktopBridge()?.storage ?? browserStorage).getItem(key),
    setItem: (key, value) =>
      (getDesktopBridge()?.storage ?? browserStorage).setItem(key, value),
    removeItem: (key) =>
      (getDesktopBridge()?.storage ?? browserStorage).removeItem(key),
  },
  window: {
    isFullscreen: () => {
      const bridge = getDesktopBridge();
      return (bridge ? bridgeWindow(bridge) : browserWindow).isFullscreen();
    },
    toggleFullscreen: () => {
      const bridge = getDesktopBridge();
      (bridge ? bridgeWindow(bridge) : browserWindow).toggleFullscreen();
    },
  },
  input: { hasControllerSupport: () => false },
  identity: {
    kind: "steam-openid",
    // only when the shell exposes Steam sign-in (PUGGIE_STEAM_OPENID=1)
    isAvailable: () => getDesktopBridge()?.steam !== undefined,
  },
  entitlements: { getOwned: async () => [] },
};
