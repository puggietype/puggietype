// Pure helpers for the desktop shell, kept free of Electron imports so they
// can be unit tested with node --test.
import path from "node:path";

export const APP_SCHEME = "app";
export const APP_HOST = "puggietype";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const WEBSITE_ORIGIN = "https://puggietype.com";

/** BrowserWindow options: renderer is sandboxed and isolated. */
export function windowOptions(preloadPath) {
  return {
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#111111",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  };
}

/**
 * Map an app:// request URL to a file inside distDir. Returns undefined for
 * other hosts or paths that escape distDir. Extensionless paths are SPA
 * routes and get index.html.
 */
export function resolveAppPath(distDir, requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) {
    return undefined;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return undefined;
  }
  if (pathname.includes("\0")) return undefined;
  if (pathname === "/" || path.posix.extname(pathname) === "") {
    pathname = "/index.html";
  }
  const root = path.resolve(distDir);
  const file = path.resolve(root, "." + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) return undefined;
  return file;
}

/** Only our own origin may load in the window; everything else opens in the OS browser. */
export function isInternalUrl(target) {
  try {
    const url = new URL(target);
    return url.protocol === `${APP_SCHEME}:` && url.host === APP_HOST;
  } catch {
    return false;
  }
}

export function isExternalOpenable(target) {
  try {
    const url = new URL(target);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

/** Fullscreen keys handled by the shell: F11, and Alt+Enter on Windows/Linux. */
export function isFullscreenShortcut(input) {
  if (input.type !== "keyDown") return false;
  if (input.key === "F11") return true;
  return (
    input.key === "Enter" && input.alt === true && !input.control && !input.meta
  );
}

/** Small JSON key/value store for the renderer's PlatformStorage. */
export class KeyValueStore {
  constructor(readFile, writeFile) {
    this.writeFile = writeFile;
    this.data = {};
    try {
      const parsed = JSON.parse(readFile());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") this.data[k] = v;
        }
      }
    } catch {
      // missing or corrupt file: start empty
    }
  }
  getItem(key) {
    if (typeof key !== "string") return null;
    return Object.hasOwn(this.data, key) ? this.data[key] : null;
  }
  setItem(key, value) {
    if (typeof key !== "string" || typeof value !== "string") return;
    if (key.length > 256 || value.length > 5_000_000) return;
    this.data[key] = value;
    this.flush();
  }
  removeItem(key) {
    if (typeof key !== "string" || !Object.hasOwn(this.data, key)) return;
    delete this.data[key];
    this.flush();
  }
  flush() {
    this.writeFile(JSON.stringify(this.data));
  }
}

export const DEFAULT_WS_ORIGIN = "wss://ws.puggietype.com";

/**
 * Pulls what the desktop CSP needs from the steam build's rendered `_headers`
 * (vite-plugins/pages-headers.ts): inline-script hashes from script-src and
 * the ws/wss origins from connect-src.
 */
export function cspInputsFromHeaders(headersText) {
  const line = String(headersText ?? "")
    .split("\n")
    .find((l) => l.trim().toLowerCase().startsWith("content-security-policy:"));
  if (line === undefined) return { scriptHashes: [], wsOrigins: [] };
  const directives = new Map(
    line
      .slice(line.indexOf(":") + 1)
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((p) => p[0])
      .map(([name, ...values]) => [name.toLowerCase(), values]),
  );
  const scriptHashes = (directives.get("script-src") ?? []).filter((v) =>
    /^'sha(256|384|512)-[A-Za-z0-9+/=]+'$/.test(v),
  );
  const wsOrigins = (directives.get("connect-src") ?? []).filter((v) =>
    /^wss?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(v),
  );
  return { scriptHashes, wsOrigins };
}

/** each ws origin plus the http(s) origin the leaderboards use */
function withHttpTwins(wsOrigins) {
  const out = [];
  for (const ws of wsOrigins) {
    out.push(ws, ws.replace(/^wss:/, "https:").replace(/^ws:/, "http:"));
  }
  return [...new Set(out)];
}

/**
 * Strict CSP for every app:// response. 'self' is app://puggietype. Network
 * access is limited to the multiplayer server (wss) and its https twin
 * (leaderboards). No eval, no remote scripts, no frames, no plugins.
 */
export function buildCsp({ scriptHashes = [], wsOrigins = [] } = {}) {
  const ws = wsOrigins.length > 0 ? wsOrigins : [DEFAULT_WS_ORIGIN];
  return [
    "default-src 'self'",
    ["script-src 'self'", ...scriptHashes].join(" "),
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    ["connect-src 'self'", ...withHttpTwins(ws)].join(" "),
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Permissions are denied unless listed here, and only for our own origin:
 * the theme share button copies a link, and the in-app fullscreen command
 * may use the HTML fullscreen API.
 */
export const ALLOWED_PERMISSIONS = new Set([
  "clipboard-sanitized-write",
  "fullscreen",
]);

export function isPermissionAllowed(permission, requestingUrl) {
  return (
    ALLOWED_PERMISSIONS.has(permission) && isInternalUrl(requestingUrl ?? "")
  );
}

// ---------------------------------------------------------------- Steam M3
// Steam OpenID 2.0 in the system browser with a 127.0.0.1 loopback return.
// No Steamworks SDK. The shell only collects the signed openid.* response;
// the game server verifies it (check_authentication) and checks ownership.
export const STEAM_OPENID_LOGIN = "https://steamcommunity.com/openid/login";
export const STEAM_CALLBACK_PATH = "/steam/callback";
export const STEAM_SIGNIN_TIMEOUT_MS = 5 * 60_000;

/** Steam sign-in is off unless PUGGIE_STEAM_OPENID=1 (no Steam app yet). */
export function steamSignInEnabled(env) {
  return env["PUGGIE_STEAM_OPENID"] === "1";
}

export function loopbackReturnTo(port, state) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("bad port");
  }
  if (!/^[0-9a-f]{32}$/.test(state)) throw new Error("bad state");
  return `http://127.0.0.1:${port}${STEAM_CALLBACK_PATH}?state=${state}`;
}

export function steamOpenIdLoginUrl(returnTo) {
  const u = new URL(STEAM_OPENID_LOGIN);
  const realm = new URL(returnTo).origin;
  u.search = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  }).toString();
  return u.toString();
}

/**
 * Parse the loopback callback. Returns the openid.* params when the path and
 * state match and the mode is id_res, "cancel" when the user cancelled, else
 * undefined.
 */
export function parseOpenIdCallback(requestUrl, state) {
  let u;
  try {
    u = new URL(requestUrl, "http://127.0.0.1");
  } catch {
    return undefined;
  }
  if (u.pathname !== STEAM_CALLBACK_PATH) return undefined;
  if (u.searchParams.get("state") !== state) return undefined;
  const mode = u.searchParams.get("openid.mode");
  if (mode === "cancel") return "cancel";
  if (mode !== "id_res") return undefined;
  const out = {};
  for (const [k, v] of u.searchParams) {
    if (k.startsWith("openid.")) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------- licenses
// GPL-3.0 bundling: the packaged app ships the license texts and a source
// offer under app://puggietype/legal/ (see scripts/package.mjs). The About
// screen links there; those links open in a small read-only window.
export const LEGAL_PATH = "/legal/";
export const LEGAL_FILES = [
  "LICENSE.txt",
  "NOTICE.txt",
  "ELECTRON-LICENSE.txt",
  "LICENSES.chromium.html",
  "SOURCE.txt",
  "DLC-ASSETS-LICENSE.txt",
];

export function isLegalUrl(target) {
  if (!isInternalUrl(target)) return false;
  const { pathname } = new URL(target);
  return LEGAL_FILES.some((f) => pathname === LEGAL_PATH + f);
}

/** Options for the license viewer: no preload, sandboxed, isolated. */
export function legalWindowOptions() {
  return {
    width: 900,
    height: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  };
}

// ---------------------------------------------------------- session token
// Steam session token (server FEATURE_STEAM_SESSION). Kept only in the OS
// secure storage through Electron safeStorage (Keychain, DPAPI, libsecret /
// kwallet): the file on disk holds ciphertext only. With no real secure
// backend (Linux "basic_text"), nothing is stored and the app signs in with
// OpenID every time. Never in storage.json, never logged.
export const SESSION_TOKEN_RX = /^[A-Za-z0-9_-]{43}$/;

export class SecureTokenStore {
  /**
   * @param {{ isEncryptionAvailable(): boolean, encryptString(s: string): Buffer,
   *   decryptString(b: Buffer): string, getSelectedStorageBackend?(): string }} safe
   * @param {{ read(): Buffer, write(b: Buffer): void, remove(): void }} file
   */
  constructor(safe, file) {
    this.safe = safe;
    this.file = file;
  }
  available() {
    try {
      if (!this.safe.isEncryptionAvailable()) return false;
      const backend = this.safe.getSelectedStorageBackend?.();
      return backend !== "basic_text" && backend !== "unknown";
    } catch {
      return false;
    }
  }
  get() {
    if (!this.available()) return null;
    try {
      const token = this.safe.decryptString(this.file.read());
      return SESSION_TOKEN_RX.test(token) ? token : null;
    } catch {
      return null;
    }
  }
  /** @returns {boolean} stored */
  set(token) {
    if (typeof token !== "string" || !SESSION_TOKEN_RX.test(token))
      return false;
    if (!this.available()) return false;
    try {
      this.file.write(this.safe.encryptString(token));
      return true;
    } catch {
      return false;
    }
  }
  clear() {
    try {
      this.file.remove();
    } catch {
      // already gone
    }
  }
}

// ------------------------------------------------------ steam ticket helper
// Optional Steamworks ticket helper (tools/steam-ticket-helper), behind
// PUGGIE_STEAM_SDK=1 (off by default). It is a separate one-shot program
// that prints one hex Web API ticket to stdout and exits; this shell never
// links the SDK. Any failure (missing helper, timeout, bad output) returns
// null, and the app falls back to the OpenID button (the kept session token
// is tried before the helper, Legal C37-1).
// The ticket is never stored or logged.
export const STEAM_TICKET_HEX_RX = /^(?:[0-9a-fA-F]{2}){16,2048}$/;
export const STEAM_TICKET_TIMEOUT_MS = 5000;
const TICKET_MAX_STDOUT = 16 * 1024;

export function steamSdkEnabled(env) {
  return env.PUGGIE_STEAM_SDK === "1";
}

export function ticketHelperName(platform) {
  return platform === "win32"
    ? "steam-ticket-helper.exe"
    : "steam-ticket-helper";
}

/** Reads only stdout; returns the hex ticket or null. */
export function parseTicketOutput(stdout) {
  if (typeof stdout !== "string") return null;
  const t = stdout.trim();
  return STEAM_TICKET_HEX_RX.test(t) ? t : null;
}

/**
 * Spawns the helper once (no shell, no arguments, stdin and stderr ignored)
 * and resolves with the ticket or null. Never rejects.
 * @param {string} file
 * @param {{ spawn: typeof import("node:child_process").spawn,
 *   exists: (f: string) => boolean, timeoutMs?: number }} deps
 */
export function runTicketHelper(file, deps) {
  return new Promise((resolve) => {
    if (!deps.exists(file)) return resolve(null);
    let out = "";
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    let child;
    try {
      child = deps.spawn(file, [], {
        stdio: ["ignore", "pipe", "ignore"],
        shell: false,
        windowsHide: true,
      });
    } catch {
      return resolve(null);
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(null);
    }, deps.timeoutMs ?? STEAM_TICKET_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      out += d;
      if (out.length > TICKET_MAX_STDOUT) {
        child.kill("SIGKILL");
        finish(null);
      }
    });
    child.on("error", () => finish(null));
    child.on("close", (code) =>
      finish(code === 0 ? parseTicketOutput(out) : null),
    );
  });
}
