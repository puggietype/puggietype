// PuggieType desktop shell (Steam flavor). Plain Electron: no Steamworks
// SDK, no ads. Loads the PLATFORM=steam web build from ../frontend/dist (or
// PUGGIE_DIST) over a private app:// scheme.
import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  safeStorage,
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
  SecureTokenStore,
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

// PUGGIE_SMOKE_TEST=1 plus PUGGIE_SMOKE_STEAM_UI=<dir>: drive the Steam
// sign-in UI against a mocked Steam (no browser) and a mocked /steam/auth,
// and save screenshots to <dir>. Ignored outside the smoke test.
const smokeSteamUiDir =
  !app.isPackaged && process.env["PUGGIE_SMOKE_TEST"] === "1"
    ? process.env["PUGGIE_SMOKE_STEAM_UI"] || undefined
    : undefined;
const SMOKE_OPENID = {
  "openid.ns": "http://specs.openid.net/auth/2.0",
  "openid.mode": "id_res",
  "openid.claimed_id": "https://steamcommunity.com/openid/id/76561197960287930",
  "openid.sig": "smoke",
};

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
      let steamUi = { ok: true };
      if (smokeSteamUiDir) steamUi = await runSteamUiSmoke(win);
      const all = ok && settings.ok && music.ok && steamUi.ok;
      console.log(JSON.stringify({ ok: all, ...r, settings, music, steamUi }));
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
    // session token in OS secure storage only (safeStorage); the smoke run
    // keeps it in memory so it never touches the real keychain
    const tokenFile = path.join(app.getPath("userData"), "steam-session.bin");
    let smokeToken = null;
    const tokens = smokeSteamUiDir
      ? new SecureTokenStore(
          {
            isEncryptionAvailable: () => true,
            getSelectedStorageBackend: () => "smoke",
            encryptString: (s) => Buffer.from(s),
            decryptString: (b) => b.toString(),
          },
          {
            read: () => {
              if (smokeToken === null) throw new Error("none");
              return smokeToken;
            },
            write: (b) => {
              smokeToken = b;
            },
            remove: () => {
              smokeToken = null;
            },
          },
        )
      : new SecureTokenStore(safeStorage, {
          read: () => fs.readFileSync(tokenFile),
          write: (b) => fs.writeFileSync(tokenFile, b, { mode: 0o600 }),
          remove: () => fs.rmSync(tokenFile, { force: true }),
        });
    ipcMain.on("steam:session:get", (event) => {
      event.returnValue = trusted(event) ? tokens.get() : null;
    });
    ipcMain.on("steam:session:set", (event, token) => {
      event.returnValue = trusted(event) ? tokens.set(token) : false;
    });
    ipcMain.on("steam:session:available", (event) => {
      event.returnValue = trusted(event) && tokens.available();
    });
    ipcMain.on("steam:session:clear", (event) => {
      if (trusted(event)) tokens.clear();
      event.returnValue = null;
    });
    ipcMain.handle("steam:signin", (event) =>
      !isInternalUrl(event.senderFrame?.url ?? "")
        ? null
        : smokeSteamUiDir
          ? { openid: SMOKE_OPENID }
          : steamSignIn(),
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

  if (smokeSteamUiDir) mockSteamAuthServer();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Steam M3: one-shot loopback listener on 127.0.0.1, system browser for the
// Steam login page. Resolves with { openid } or { error: "cancelled" |
// "timeout" | "busy" | "failed" }. The server verifies the openid params;
// nothing is trusted here.
let steamSignInRunning = false;
function steamSignIn() {
  if (steamSignInRunning) return Promise.resolve({ error: "busy" });
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
      finish(result === "cancel" ? { error: "cancelled" } : { openid: result });
    });
    const finish = (value) => {
      clearTimeout(timer);
      server.close();
      steamSignInRunning = false;
      resolve(value);
    };
    timer = setTimeout(
      () => finish({ error: "timeout" }),
      STEAM_SIGNIN_TIMEOUT_MS,
    );
    server.on("error", () => finish({ error: "failed" }));
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
    // no option label wraps (QA PR30-VISUAL)
    await js(`document.getElementById("settings-tab-graphics").click()`);
    await waitFor('[data-testid="steam-graphics"]');
    out.wrapped =
      await js(`[...document.querySelectorAll("[data-steam-choice] > button")].filter((b) => {
      const r = document.createRange(); r.selectNodeContents(b);
      const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
      return lines.size > 1 || b.scrollWidth > b.clientWidth;
    }).map((b) => b.textContent)`);
    // every option row is full or evenly split: no lone option on the
    // last row (QA PR30-SCALE-ORPHAN)
    out.orphans =
      await js(`[...document.querySelectorAll("[data-steam-choice]")].filter((g) => {
      const rows = new Map();
      for (const b of g.children) {
        const top = Math.round(b.getBoundingClientRect().top);
        rows.set(top, (rows.get(top) ?? 0) + 1);
      }
      const counts = [...rows.values()];
      return counts.length > 1 && counts[counts.length - 1] === 1;
    }).map((g) => g.dataset.testid)`);
    out.percent = await js(
      `[...document.querySelectorAll('[data-testid="steam-sound"] [data-steam-slider] > div > div:first-child')].map((d) => d.textContent)`,
    );
    // D-pad walk with real layout on /settings and /
    out.padSettings = await padWalk(win);
    const home = new Promise((res) =>
      win.webContents.once("did-finish-load", res),
    );
    void win.loadURL(`${APP_ORIGIN}/`);
    await home;
    await new Promise((res) => setTimeout(res, 1500));
    out.padHome = await padWalk(win, 15);
    out.ok =
      out.graphics === true &&
      out.sound === true &&
      out.graphicsInView === true &&
      out.soundInView === true &&
      out.musicDefault === "on" &&
      out.wrapped.length === 0 &&
      out.orphans.length === 0 &&
      out.percent.length === 3 &&
      out.percent.every((t) => /^\d+%$/.test(t)) &&
      out.padSettings.stuck === 0 &&
      out.padSettings.hidden === 0 &&
      out.padSettings.distinct >= 20 &&
      out.padHome.stuck === 0 &&
      out.padHome.hidden === 0 &&
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

// Smoke only: answers POST /steam/auth on the game server's https origin with
// a canned verified response; everything else goes to the network as usual.
const smokeSessionCalls = [];
function mockSteamAuthServer() {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST",
    "access-control-allow-headers": "content-type",
  };
  protocol.handle("https", (request) => {
    const url = new URL(request.url);
    const mocked = [
      "/steam/auth",
      "/steam/session",
      "/steam/session/signout",
      "/steam/account/delete",
    ];
    if (!mocked.includes(url.pathname)) {
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    smokeSessionCalls.push(url.pathname);
    const json = (body) =>
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json", ...cors },
      });
    if (url.pathname === "/steam/session/signout") return json({ ok: true });
    if (url.pathname === "/steam/account/delete") {
      return json({ ok: true, deleted: true });
    }
    // /steam/auth and /steam/session: a fresh (fake) rotated token each time
    return json({
      ok: true,
      steamId: "76561197960287930",
      ownsApp: true,
      ownedDlc: [],
      personaName: "PugFan",
      sessionToken: crypto.randomBytes(32).toString("base64url"),
      sessionExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
  });
}

// Smoke only: settings > gameplay > steam account. Screenshots the signed-out
// button, the M3-HINT dialog and the signed-in state into smokeSteamUiDir.
async function runSteamUiSmoke(win) {
  const js = (code) => win.webContents.executeJavaScript(code);
  const waitFor = (sel, present = true) =>
    js(`new Promise((res) => {
      const t0 = Date.now();
      const tick = () => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if ((el !== null) === ${present}) return res(true);
        if (Date.now() - t0 > 10000) return res(false);
        setTimeout(tick, 100);
      };
      tick();
    })`);
  const shot = async (name) => {
    await new Promise((res) => setTimeout(res, 400));
    const image = await win.webContents.capturePage();
    const file = path.join(smokeSteamUiDir, name);
    fs.writeFileSync(file, image.toPNG());
    return file;
  };
  const click = (sel) =>
    js(
      `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.click(); return el !== null; })()`,
    );
  // Settings content above loads late and shifts the page, so scroll until
  // the section heading stays near the top of the viewport.
  const showSteamSection = () =>
    js(`new Promise((res) => {
      let n = 0;
      const step = () => {
        const sec = document.getElementById("group_steamAccount");
        if (!sec) return res(false);
        sec.scrollIntoView({ block: "start" });
        setTimeout(() => {
          const top = sec.getBoundingClientRect().top;
          const ok = top >= 0 && top < 120;
          if (ok || ++n > 20) return res(ok);
          step();
        }, 250);
      };
      step();
    })`);
  const out = { ok: false, shots: [] };
  try {
    fs.mkdirSync(smokeSteamUiDir, { recursive: true });
    win.setFullScreen(false);
    const loaded = new Promise((res) =>
      win.webContents.once("did-finish-load", res),
    );
    void win.loadURL(`${APP_ORIGIN}/settings`);
    await loaded;
    if (!(await waitFor("#settings-tab-gameplay"))) {
      return { ...out, reason: "no settings tabs" };
    }
    await click("#settings-tab-gameplay");
    const hasBridge = await js(`window.puggieDesktop.steam !== undefined`);
    if (!hasBridge) {
      // flag off: the button must not appear
      out.button = !(await waitFor("#steam-signin-button", false));
      out.ok = out.button === false;
      return out;
    }
    out.button = await waitFor("#steam-signin-button", true);
    if (!out.button) return { ...out, reason: "no sign-in button" };
    out.inView = await showSteamSection();
    // QA: the empty live region adds no gap above the button
    const layout = () =>
      js(`(() => {
        const box = document.querySelector('[data-testid="steam-signin"]');
        const region = document.getElementById("steam-signin-status");
        const next = region?.nextElementSibling;
        const btn = box?.querySelector("button");
        if (!box || !region || !btn) return null;
        const top = box.getBoundingClientRect().top;
        return {
          empty: region.matches(":empty"),
          ruleMatches: next?.matches("#steam-signin-status:empty + *") ?? false,
          marginTop: next ? getComputedStyle(next).marginTop : null,
          buttonOffset: btn.getBoundingClientRect().top - top,
          regionBottom: region.getBoundingClientRect().bottom - top,
        };
      })()`);
    out.idleLayout = await layout();
    out.shots.push(await shot("signed-out.png"));
    await click("#steam-signin-button");
    await showSteamSection();
    out.hint = await js(
      `document.getElementById("steam-signin-hint-text")?.textContent ?? null`,
    );
    out.shots.push(await shot("hint-dialog.png"));
    await click("#steam-signin-continue");
    out.signedIn = await waitFor('[data-testid="steam-signin-name"]');
    out.name = await js(
      `document.querySelector('[data-testid="steam-signin-name"]')?.textContent ?? null`,
    );
    await showSteamSection();
    out.signedInLayout = await layout();
    out.shots.push(await shot("signed-in.png"));
    await click("#steam-name-hidden-on");
    out.hiddenWorks = await waitFor('[data-testid="steam-signin-name"]', false);
    await click("#steam-name-hidden-off");

    // session token: kept in (smoke) secure storage; a reload signs in
    // silently with it; Delete my sign-in data asks first, then clears it
    out.tokenKept = await js(
      `typeof window.puggieDesktop.steam.session?.get() === "string"`,
    );
    const reloaded = new Promise((res) =>
      win.webContents.once("did-finish-load", res),
    );
    void win.loadURL(`${APP_ORIGIN}/settings`);
    await reloaded;
    await waitFor("#settings-tab-gameplay");
    await click("#settings-tab-gameplay");
    out.silent = await waitFor('[data-testid="steam-signin-name"]');
    out.silentUsedSession = smokeSessionCalls.includes("/steam/session");
    await showSteamSection();
    out.deleteButton = await waitFor("#steam-delete-button");
    await js(
      `document.getElementById("steam-delete-button").scrollIntoView({ block: "center" })`,
    );
    out.shots.push(await shot("delete-button.png"));
    await click("#steam-delete-button");
    out.confirmFocus = await js(`document.activeElement?.id ?? null`);
    out.shots.push(await shot("delete-confirm.png"));
    await click("#steam-delete-confirm");
    out.backToSignIn = await waitFor("#steam-signin-button");
    out.deletedText = await js(
      `document.getElementById("steam-signin-status")?.textContent ?? null`,
    );
    out.tokenCleared = await js(
      `window.puggieDesktop.steam.session?.get() === null`,
    );
    out.deleteCalled = smokeSessionCalls.includes("/steam/account/delete");
    out.shots.push(await shot("delete-done.png"));
    out.ok =
      out.hint ===
        "Steam will show this sign-in as coming from 127.0.0.1 (your own computer)." &&
      out.signedIn === true &&
      out.name === "PugFan" &&
      out.hiddenWorks === true &&
      out.tokenKept === true &&
      out.silent === true &&
      out.silentUsedSession === true &&
      out.deleteButton === true &&
      out.confirmFocus === "steam-delete-cancel" &&
      out.backToSignIn === true &&
      out.deletedText === "Your sign-in data was deleted. You're signed out." &&
      out.tokenCleared === true &&
      out.deleteCalled === true &&
      out.inView === true &&
      // empty: the rule matches and the button sits where the region is
      out.idleLayout?.empty === true &&
      out.idleLayout.ruleMatches === true &&
      out.idleLayout.marginTop === "-8px" &&
      Math.abs(out.idleLayout.buttonOffset - out.idleLayout.regionBottom) <
        0.5 &&
      // with text: no pull-up, the normal 8px gap stays
      out.signedInLayout?.empty === false &&
      out.signedInLayout.ruleMatches === false &&
      out.signedInLayout.marginTop === "0px" &&
      Math.abs(
        out.signedInLayout.buttonOffset - out.signedInLayout.regionBottom - 8,
      ) < 0.5;
    return out;
  } catch (e) {
    return { ...out, reason: String(e) };
  }
}

// Smoke only (QA PR30-PAD-STUCK): a fake standard gamepad presses D-pad down
// `n` times on the current page; focus must move every time and only onto
// rendered controls.
async function padWalk(win, n = 30) {
  return win.webContents.executeJavaScript(`new Promise((res) => {
    let down = false;
    const pad = {
      connected: true,
      buttons: Array.from({ length: 16 }, (_, i) => ({ get pressed() { return i === 13 && down; }, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad] });
    window.dispatchEvent(new Event("gamepadconnected"));
    const frames = (k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const steps = [];
    (async () => {
      let prev = document.activeElement;
      let stuck = 0, hidden = 0;
      for (let i = 0; i < ${n}; i++) {
        down = true; await frames(3); down = false; await frames(3);
        const a = document.activeElement;
        if (a === prev || a === document.body) stuck++;
        if (a && a !== document.body && typeof a.checkVisibility === "function" && !a.checkVisibility({ visibilityProperty: true })) hidden++;
        steps.push((a?.id || a?.getAttribute?.("aria-label") || a?.textContent || "").trim().slice(0, 24));
        prev = a;
      }
      res({ steps, stuck, hidden, distinct: new Set(steps).size });
    })();
  })`);
}
