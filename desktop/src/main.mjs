// PuggieType desktop shell (Steam flavor). Plain Electron: no Steamworks
// SDK, no ads. Loads the PLATFORM=steam web build from ../frontend/dist (or
// PUGGIE_DIST) over a private app:// scheme.
import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  screen,
  session,
  shell,
} from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  APP_ORIGIN,
  APP_SCHEME,
  KeyValueStore,
  buildCsp,
  cspInputsFromHeaders,
  isPermissionAllowed,
  isExternalOpenable,
  isLegalUrl,
  legalWindowOptions,
  isFullscreenShortcut,
  isInternalUrl,
  resolveAppPath,
  STEAM_SIGNIN_TIMEOUT_MS,
  loopbackReturnTo,
  parseOpenIdCallback,
  steamOpenIdLoginUrl,
  steamSignInEnabled,
  windowOptions,
} from "./shell.mjs";
import {
  STEAM_SETTINGS_KEY,
  applyWindowState,
  needsRestart,
  parseDisplay,
  vsyncSwitches,
  windowOptionsFor,
  windowState,
} from "./display.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
// packaged (scripts/package.mjs): ../web next to src/; dev: ../../frontend/dist
const packagedWeb = path.resolve(here, "../web");
const distDir =
  process.env["PUGGIE_DIST"] ??
  (fs.existsSync(path.join(packagedWeb, "index.html"))
    ? packagedWeb
    : path.resolve(here, "../../frontend/dist"));

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      // media elements (music) need streaming + range support
      stream: true,
    },
  },
]);

if (!app.requestSingleInstanceLock()) app.quit();

// Steam game settings the shell applies (display mode, resolution, VSync),
// read from the renderer's store once at launch. VSync is a Chromium
// switch, so changing it needs a restart.
function readStartDisplay() {
  try {
    const file = path.join(app.getPath("userData"), "storage.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return parseDisplay(data?.[STEAM_SETTINGS_KEY]);
  } catch {
    return parseDisplay(null);
  }
}
const startDisplay = readStartDisplay();
for (const sw of vsyncSwitches(startDisplay)) app.commandLine.appendSwitch(sw);

function screenFor(display) {
  const d = screen.getPrimaryDisplay();
  return display.displayMode === "borderless" ? d.bounds : d.workArea;
}

let store;

// PUGGIE_SMOKE_TEST=1 plus PUGGIE_SMOKE_SETTINGS=<dir>: open settings, check
// the steam game settings and save a screenshot per tab into <dir>.
// Never in a packaged app.
// PUGGIE_SMOKE_TEST=1 plus PUGGIE_SMOKE_MUSIC=1 (use a throwaway profile):
// turns music on and UI scale to 125% in the store, reloads, then checks
// the scale at startup, that music plays after a click, and that it pauses
// while a test runs. Never in a packaged app.
const smokeMusic =
  !app.isPackaged &&
  process.env["PUGGIE_SMOKE_TEST"] === "1" &&
  process.env["PUGGIE_SMOKE_MUSIC"] === "1";
const smokeSettingsDir =
  !app.isPackaged && process.env["PUGGIE_SMOKE_TEST"] === "1"
    ? process.env["PUGGIE_SMOKE_SETTINGS"] || undefined
    : undefined;

function createWindow() {
  const win = new BrowserWindow({
    ...windowOptions(path.join(here, "preload.cjs")),
    ...windowOptionsFor(startDisplay),
  });
  applyWindowState(win, windowState(startDisplay, screenFor(startDisplay)));
  win.once("ready-to-show", () => win.show());

  win.webContents.on("before-input-event", (event, input) => {
    if (isFullscreenShortcut(input)) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // About -> licenses / source offer: read-only child window, no preload
    if (isLegalUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: legalWindowOptions(),
      };
    }
    if (isExternalOpenable(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("did-create-window", (child) => {
    // the license viewer never navigates; links go to the OS browser
    child.webContents.on("will-navigate", (event, url) => {
      event.preventDefault();
      if (isExternalOpenable(url)) void shell.openExternal(url);
    });
    child.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalOpenable(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
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
      r.evalBlocked = await win.webContents.executeJavaScript(
        `(() => { try { eval("1"); return false; } catch { return true; } })()`,
      );
      r.geolocation = await win.webContents.executeJavaScript(
        `navigator.permissions.query({ name: "geolocation" }).then((p) => p.state)`,
      );
      r.remoteFetchBlocked = await win.webContents.executeJavaScript(
        `fetch("https://example.com/").then(() => false, () => true)`,
      );
      win.setFullScreen(true);
      await new Promise((res) => setTimeout(res, 1500));
      r.fullscreen = win.isFullScreen();
      clearTimeout(timer);
      const ok =
        !r.hasRequire &&
        !r.hasProcess &&
        r.bridgeVersion === 1 &&
        r.stored === "1" &&
        r.evalBlocked === true &&
        r.geolocation !== "granted" &&
        r.remoteFetchBlocked === true &&
        r.fullscreen === true;
      let settings = { ok: true };
      if (smokeSettingsDir) settings = await runSettingsSmoke(win);
      let music = { ok: true };
      if (smokeMusic) music = await runMusicSmoke(win);
      const all = ok && settings.ok && music.ok;
      console.log(JSON.stringify({ ok: all, ...r, settings, music }));
      app.exit(all ? 0 : 1);
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

  // Strict CSP on every app:// response (Pages _headers do not apply here).
  let headersText = "";
  try {
    headersText = fs.readFileSync(path.join(distDir, "_headers"), "utf8");
  } catch {
    // no _headers: default ws origin, no inline-script hashes
  }
  const csp = buildCsp(cspInputsFromHeaders(headersText));

  protocol.handle(APP_SCHEME, async (request) => {
    const target = resolveAppPath(distDir, request.url);
    if (target === undefined || !fs.existsSync(target)) {
      return new Response("not found", {
        status: 404,
        headers: { "content-security-policy": csp },
      });
    }
    const res = await net.fetch(pathToFileURL(target).toString());
    const headers = new Headers(res.headers);
    headers.set("content-security-policy", csp);
    headers.set("x-content-type-options", "nosniff");
    return new Response(res.body, { status: res.status, headers });
  });

  // Deny every permission by default (camera, mic, geolocation, ...).
  session.defaultSession.setPermissionRequestHandler(
    (wc, permission, callback, details) => {
      callback(
        isPermissionAllowed(permission, details?.requestingUrl ?? wc?.getURL()),
      );
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission, requestingOrigin) =>
      isPermissionAllowed(permission, requestingOrigin),
  );

  const fromWindow = (event) => BrowserWindow.fromWebContents(event.sender);
  const trusted = (event) => isInternalUrl(event.senderFrame?.url ?? "");

  const steamEnabled = steamSignInEnabled(process.env);
  ipcMain.on("steam:enabled", (event) => {
    event.returnValue = steamEnabled;
  });
  if (steamEnabled) {
    ipcMain.handle("steam:signin", (event) =>
      isInternalUrl(event.senderFrame?.url ?? "") ? steamSignIn() : null,
    );
  }
  ipcMain.on("fullscreen:get", (event) => {
    event.returnValue =
      trusted(event) && fromWindow(event)?.isFullScreen() === true;
  });
  ipcMain.on("fullscreen:toggle", (event) => {
    if (!trusted(event)) return;
    const win = fromWindow(event);
    win?.setFullScreen(!win.isFullScreen());
  });
  // live display changes from the Graphics settings; returns whether the
  // change only fully applies after a restart
  ipcMain.on("display:apply", (event, json) => {
    // returnValue answers the sync call, so set it exactly once
    const win = trusted(event) ? fromWindow(event) : null;
    if (!win) {
      event.returnValue = { restartRequired: false };
      return;
    }
    const next = parseDisplay(String(json));
    applyWindowState(win, windowState(next, screenFor(next)));
    event.returnValue = { restartRequired: needsRestart(startDisplay, next) };
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

// Steam M3: one-shot loopback listener on 127.0.0.1, system browser for the
// Steam login page. Resolves with the openid.* params, or null on cancel or
// timeout. The server verifies them; nothing is trusted here.
let steamSignInRunning = false;
function steamSignIn() {
  if (steamSignInRunning) return Promise.resolve(null);
  steamSignInRunning = true;
  const state = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve) => {
    let timer;
    const server = http.createServer((req, res) => {
      const result = parseOpenIdCallback(req.url ?? "", state);
      if (result === undefined) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(
        "<!doctype html><meta charset=utf-8><title>PuggieType</title><p>You can close this tab and return to PuggieType.</p>",
      );
      finish(result === "cancel" ? null : result);
    });
    const finish = (value) => {
      clearTimeout(timer);
      server.close();
      steamSignInRunning = false;
      resolve(value === null ? null : { openid: value });
    };
    timer = setTimeout(() => finish(null), STEAM_SIGNIN_TIMEOUT_MS);
    server.on("error", () => finish(null));
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      void shell.openExternal(
        steamOpenIdLoginUrl(loopbackReturnTo(port, state)),
      );
    });
  });
}

// Smoke only: settings tabs with the steam Graphics and Sound groups.
async function runSettingsSmoke(win) {
  const js = (code) => win.webContents.executeJavaScript(code);
  const waitFor = (sel) =>
    js(`new Promise((res) => {
      const t0 = Date.now();
      const tick = () => {
        if (document.querySelector(${JSON.stringify(sel)})) return res(true);
        if (Date.now() - t0 > 10000) return res(false);
        setTimeout(tick, 100);
      };
      tick();
    })`);
  // late-loading content shifts the page: scroll until the target stays put
  const show = (sel) =>
    js(`new Promise((res) => {
      let n = 0;
      const step = () => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return res(false);
        el.scrollIntoView({ block: "start" });
        setTimeout(() => {
          const top = el.getBoundingClientRect().top;
          // last group on the page: it may not reach the top, so accept any
          // position where its heading is on screen
          const ok = top >= 0 && top < window.innerHeight - 100;
          if ((top >= 0 && top < 120) || ++n > 20) return res(ok);
          step();
        }, 250);
      };
      step();
    })`);
  const shot = async (name) => {
    await new Promise((res) => setTimeout(res, 400));
    const image = await win.webContents.capturePage();
    const file = path.join(smokeSettingsDir, name);
    fs.writeFileSync(file, image.toPNG());
    return file;
  };
  const out = { ok: false, shots: [] };
  try {
    fs.mkdirSync(smokeSettingsDir, { recursive: true });
    win.setFullScreen(false);
    const loaded = new Promise((res) =>
      win.webContents.once("did-finish-load", res),
    );
    void win.loadURL(`${APP_ORIGIN}/settings`);
    await loaded;
    if (!(await waitFor("#settings-tab-graphics"))) {
      return { ...out, reason: "no settings tabs" };
    }
    await js(`document.getElementById("settings-tab-graphics").click()`);
    out.graphics = await waitFor('[data-testid="steam-graphics"]');
    out.graphicsInView = await show('[data-testid="steam-graphics"]');
    out.shots.push(await shot("graphics.png"));
    await js(
      `document.getElementById("steam-graphics-reset")?.scrollIntoView({ block: "end" })`,
    );
    out.shots.push(await shot("graphics-2.png"));
    await js(`document.getElementById("settings-tab-sound").click()`);
    out.sound = await waitFor('[data-testid="steam-sound"]');
    out.soundInView = await show('[data-testid="steam-sound"]');
    out.musicDefault = await js(
      `[...document.querySelectorAll('[data-testid="steam-music-enabled"] button')].find((b) => b.getAttribute("aria-pressed") === "true")?.textContent ?? null`,
    );
    out.audioElements = await js(`document.querySelectorAll("audio").length`);
    out.musicFile = await js(
      `fetch("/music/sherwood.ogg").then((r) => r.status + " " + r.headers.get("content-type"), (e) => String(e))`,
    );
    out.shots.push(await shot("sound.png"));
    await js(
      `document.querySelector('[data-testid="steam-music-while-typing"]')?.scrollIntoView({ block: "end" })`,
    );
    out.shots.push(await shot("sound-2.png"));
    await js(`document.getElementById("settings-tab-gameplay").click()`);
    await js(`window.scrollTo(0, 0)`);
    out.shots.push(await shot("gameplay.png"));
    out.ok =
      out.graphics === true &&
      out.sound === true &&
      out.graphicsInView === true &&
      out.soundInView === true &&
      out.musicDefault === "on" &&
      String(out.musicFile).startsWith("200 audio/");
    return out;
  } catch (e) {
    return { ...out, reason: String(e) };
  }
}

// Smoke only (throwaway profile): music playback and UI scale at startup.
async function runMusicSmoke(win) {
  const js = (code) => win.webContents.executeJavaScript(code);
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const audioState = () =>
    js(`(() => {
      const a = document.querySelector("audio[data-steam-music]");
      return a ? { paused: a.paused, t: a.currentTime, src: a.getAttribute("src"), rs: a.readyState, err: a.error?.code ?? null } : null;
    })()`);
  const out = { ok: false };
  try {
    win.setFullScreen(false);
    win.focus();
    win.webContents.focus();
    await js(`window.puggieDesktop.storage.setItem("steamGameSettings", JSON.stringify({
      uiScale: 1.25, brightness: 1.2, fpsCap: 30, animation: "off",
      masterVolume: 1,
      music: { enabled: true, volume: 0.2, track: "sherwood", whileTyping: "pause" },
    }))`);
    const loaded = new Promise((res) =>
      win.webContents.once("did-finish-load", res),
    );
    void win.loadURL(`${APP_ORIGIN}/`);
    await loaded;
    await sleep(2000);
    // (d) applied at startup, before any interaction
    out.zoom = await js(`document.documentElement.style.zoom`);
    out.uiScale = await js(`document.documentElement.dataset.uiScale ?? null`);
    out.brightness = await js(`document.documentElement.style.filter`);
    out.fpsCap = await js(`document.documentElement.dataset.fpsCap ?? null`);
    out.animOff = await js(
      `document.documentElement.classList.contains("anim-off")`,
    );
    // Electron main applies display changes through BrowserWindow
    await js(
      `window.puggieDesktop.display.apply({ displayMode: "windowed", resolution: "1280x720", vsync: true })`,
    );
    await sleep(300);
    out.windowSize = win.getSize();
    out.vsyncRestart = await js(
      `window.puggieDesktop.display.apply({ displayMode: "windowed", resolution: "1280x720", vsync: false })`,
    );
    await js(
      `window.puggieDesktop.display.apply({ displayMode: "windowed", resolution: "1280x720", vsync: true })`,
    );
    out.beforeGesture = await audioState();
    // (c) a real click is the gesture that allows playback
    win.webContents.sendInputEvent({
      type: "mouseDown",
      x: 10,
      y: 10,
      button: "left",
      clickCount: 1,
    });
    win.webContents.sendInputEvent({
      type: "mouseUp",
      x: 10,
      y: 10,
      button: "left",
      clickCount: 1,
    });
    await sleep(1500);
    const a1 = await audioState();
    await sleep(1500);
    const a2 = await audioState();
    out.playing = a1 !== null && a2 !== null && !a2.paused;
    out.src = a2?.src ?? null;
    out.timeAdvanced = a1 !== null && a2 !== null && a2.t > a1.t;
    out.t = [a1?.t ?? null, a2?.t ?? null];
    out.audio = a2;
    // type a few letters to start a test; music must pause
    await js(`document.querySelector("#wordsInput")?.focus()`);
    const word = await js(
      `(document.querySelector("#words .word")?.textContent ?? "the").trim()`,
    );
    for (const ch of String(word || "the").slice(0, 3)) {
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: ch });
      win.webContents.sendInputEvent({ type: "char", keyCode: ch });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: ch });
      await sleep(80);
    }
    await sleep(500);
    out.path = await js(`location.pathname`);
    out.typed = await js(
      `document.querySelector("#wordsInput")?.value ?? null`,
    );
    out.testActive =
      typeof out.typed === "string" && out.typed.trim().length > 0;
    out.pausedDuringTest = out.playing && (await audioState())?.paused === true;
    out.ok =
      out.zoom === "1.25" &&
      out.uiScale === "1.25" &&
      out.brightness === "brightness(1.2)" &&
      out.fpsCap === "30" &&
      out.animOff === true &&
      out.windowSize?.[0] === 1280 &&
      out.windowSize?.[1] === 720 &&
      out.vsyncRestart?.restartRequired === true &&
      out.beforeGesture === null &&
      out.playing === true &&
      out.timeAdvanced === true &&
      out.src === "/music/sherwood.ogg" &&
      out.testActive === true &&
      out.pausedDuringTest === true;
    return out;
  } catch (e) {
    return { ...out, reason: String(e) };
  }
}
