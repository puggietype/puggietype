// Sandboxed preload: exposes only what the steam PlatformAdapter needs.
// Shape must match frontend/src/ts/platform/desktop-bridge.ts.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("puggieDesktop", {
  version: 1,
  fullscreen: {
    isFullscreen: () => ipcRenderer.sendSync("fullscreen:get") === true,
    toggle: () => ipcRenderer.send("fullscreen:toggle"),
  },
  storage: {
    getItem: (key) => {
      const v = ipcRenderer.sendSync("storage:get", String(key));
      return typeof v === "string" ? v : null;
    },
    setItem: (key, value) => {
      ipcRenderer.sendSync("storage:set", String(key), String(value));
    },
    removeItem: (key) => {
      ipcRenderer.sendSync("storage:remove", String(key));
    },
  },
});
