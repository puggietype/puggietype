import { browserStorage, browserWindow } from "./browser";
import { bridgeWindow, getDesktopBridge } from "./desktop-bridge";
import { PlatformAdapter } from "./types";

/**
 * Steam flavor. No Steamworks SDK: the Electron shell (desktop/) exposes
 * fullscreen and storage through a contextBridge preload. Without the shell
 * (e.g. the steam build opened in a browser) it falls back to browser APIs.
 * M3 wires Steam OpenID sign-in and server-side ownership checks.
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
  identity: { kind: "steam-openid", isAvailable: () => false },
  entitlements: { getOwned: async () => [] },
};
