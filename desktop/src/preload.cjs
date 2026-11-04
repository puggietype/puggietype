// Sandboxed preload: exposes only what the steam PlatformAdapter needs.
// Shape must match frontend/src/ts/platform/desktop-bridge.ts.
const { contextBridge, ipcRenderer } = require("electron");

const steamEnabled = ipcRenderer.sendSync("steam:enabled") === true;

contextBridge.exposeInMainWorld("puggieDesktop", {
  version: 1,
  // Steam M3: only when the shell runs with PUGGIE_STEAM_OPENID=1
  ...(steamEnabled
    ? {
        steam: {
          signIn: () => ipcRenderer.invoke("steam:signin"),
          // session token, kept in OS secure storage by the main process
          session: {
            get: () => {
              const v = ipcRenderer.sendSync("steam:session:get");
              return typeof v === "string" ? v : null;
            },
            set: (token) =>
              ipcRenderer.sendSync("steam:session:set", String(token)) === true,
            clear: () => {
              ipcRenderer.sendSync("steam:session:clear");
            },
          },
        },
      }
    : {}),
  // Steam Graphics settings: display mode + resolution (VSync at launch)
  display: {
    apply: (settings) => {
      const r = ipcRenderer.sendSync("display:apply", JSON.stringify(settings));
      return { restartRequired: r?.restartRequired === true };
    },
  },
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
