// PuggieType desktop shell (Steam flavor). Plain Electron: no Steamworks
// SDK, no ads. Loads the PLATFORM=steam web build from ../frontend/dist (or
// PUGGIE_DIST) over a private app:// scheme.
import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
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
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let store;

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
  const win = new BrowserWindow(windowOptions(path.join(here, "preload.cjs")));
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
      let steamUi = { ok: true };
      if (smokeSteamUiDir) steamUi = await runSteamUiSmoke(win);
      console.log(JSON.stringify({ ok: ok && steamUi.ok, ...r, steamUi }));
      app.exit(ok && steamUi.ok ? 0 : 1);
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

// Smoke only: answers POST /steam/auth on the game server's https origin with
// a canned verified response; everything else goes to the network as usual.
function mockSteamAuthServer() {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST",
    "access-control-allow-headers": "content-type",
  };
  protocol.handle("https", (request) => {
    const url = new URL(request.url);
    if (url.pathname !== "/steam/auth") {
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    return new Response(
      JSON.stringify({
        ok: true,
        steamId: "76561197960287930",
        ownsApp: true,
        ownedDlc: [],
        personaName: "PugFan",
      }),
      { headers: { "content-type": "application/json", ...cors } },
    );
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
    out.shots.push(await shot("signed-in.png"));
    await click("#steam-name-hidden-on");
    out.hiddenWorks = await waitFor('[data-testid="steam-signin-name"]', false);
    await click("#steam-name-hidden-off");
    out.ok =
      out.hint ===
        "Steam will show this sign-in as coming from 127.0.0.1 (your own computer)." &&
      out.signedIn === true &&
      out.name === "PugFan" &&
      out.hiddenWorks === true &&
      out.inView === true;
    return out;
  } catch (e) {
    return { ...out, reason: String(e) };
  }
}
