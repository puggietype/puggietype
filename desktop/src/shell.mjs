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
