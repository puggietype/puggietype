// PuggieType desktop shell (Steam flavor). Plain Electron: no Steamworks
// SDK, no ads. Loads the PLATFORM=steam web build from ../frontend/dist (or
// PUGGIE_DIST) over a private app:// scheme.
import { app, BrowserWindow, ipcMain, net, protocol, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  APP_ORIGIN,
  APP_SCHEME,
  KeyValueStore,
  isExternalOpenable,
  isFullscreenShortcut,
  isInternalUrl,
  resolveAppPath,
  windowOptions,
} from "./shell.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir =
  process.env["PUGGIE_DIST"] ?? path.resolve(here, "../../frontend/dist");

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let store;

function createWindow() {
  const win = new BrowserWindow(windowOptions(path.join(here, "preload.cjs")));
  win.once("ready-to-show", () => win.show());

  win.webContents.on("before-input-event", (event, input) => {
    if (isFullscreenShortcut(input)) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalOpenable(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url)) return;
    event.preventDefault();
    if (isExternalOpenable(url)) void shell.openExternal(url);
  });

  if (process.env["PUGGIE_SMOKE_TEST"] === "1") runSmokeTest(win);
  void win.loadURL(`${APP_ORIGIN}/`);
  return win;
}

// PUGGIE_SMOKE_TEST=1: load the app, check the sandbox and the bridge, print
// one JSON line and exit (0 = pass). Used by `npm run smoke`.
function runSmokeTest(win) {
  const fail = (reason) => {
    console.log(JSON.stringify({ ok: false, reason }));
    app.exit(1);
  };
  const timer = setTimeout(() => fail("timeout"), 30_000);
  win.webContents.once("did-fail-load", (_e, code, desc) =>
    fail(`load ${code} ${desc}`),
  );
  win.webContents.once("did-finish-load", async () => {
    try {
      const r = await win.webContents.executeJavaScript(`(() => {
        const b = window.puggieDesktop;
        b.storage.setItem("smoke", "1");
        const stored = b.storage.getItem("smoke");
        b.storage.removeItem("smoke");
        return {
          title: document.title,
          hasRequire: typeof require !== "undefined",
          hasProcess: typeof process !== "undefined",
          bridgeVersion: b.version,
          stored,
        };
      })()`);
      win.setFullScreen(true);
      await new Promise((res) => setTimeout(res, 1500));
      r.fullscreen = win.isFullScreen();
      clearTimeout(timer);
      const ok =
        !r.hasRequire &&
        !r.hasProcess &&
        r.bridgeVersion === 1 &&
        r.stored === "1";
      console.log(JSON.stringify({ ok, ...r }));
      app.exit(ok ? 0 : 1);
    } catch (e) {
      fail(String(e));
    }
  });
}

app.whenReady().then(() => {
  const file = path.join(app.getPath("userData"), "storage.json");
  store = new KeyValueStore(
    () => fs.readFileSync(file, "utf8"),
    (data) => fs.writeFileSync(file, data),
  );

  protocol.handle(APP_SCHEME, (request) => {
    const target = resolveAppPath(distDir, request.url);
    if (target === undefined || !fs.existsSync(target)) {
      return new Response("not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });

  const fromWindow = (event) => BrowserWindow.fromWebContents(event.sender);
  const trusted = (event) => isInternalUrl(event.senderFrame?.url ?? "");

  ipcMain.on("fullscreen:get", (event) => {
    event.returnValue =
      trusted(event) && fromWindow(event)?.isFullScreen() === true;
  });
  ipcMain.on("fullscreen:toggle", (event) => {
    if (!trusted(event)) return;
    const win = fromWindow(event);
    win?.setFullScreen(!win.isFullScreen());
  });
  ipcMain.on("storage:get", (event, key) => {
    event.returnValue = trusted(event) ? store.getItem(key) : null;
  });
  ipcMain.on("storage:set", (event, key, value) => {
    if (trusted(event)) store.setItem(key, value);
    event.returnValue = null;
  });
  ipcMain.on("storage:remove", (event, key) => {
    if (trusted(event)) store.removeItem(key);
    event.returnValue = null;
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
