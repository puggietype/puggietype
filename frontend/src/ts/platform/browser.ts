import { PlatformStorage, PlatformWindow } from "./types";

export const browserStorage: PlatformStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};

export const browserWindow: PlatformWindow = {
  isFullscreen: () => document.fullscreenElement !== null,
  toggleFullscreen: () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  },
};
