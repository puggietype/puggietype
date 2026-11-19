import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Plugin } from "vite";

import { cspWithoutAnalyticsAds } from "./ga4-csp";
import { KIDS_CSP_PATHS } from "./kids-csp-paths";

export { KIDS_CSP_PATHS };

/**
 * img-src for the kids guides. The built page loads only same-origin images
 * (favicon.ico / favicon.svg, manifest icons); its pug is inline SVG and its
 * CSS has no url() images or data: URIs.
 */
export const KIDS_IMG_SRC = "img-src 'self'";

/**
 * connect-src for the kids guides. The page makes no fetch, XHR, or websocket
 * calls (its only script is kids-flow.js, a sessionStorage flag), so the
 * game server, poetrydb, and wikipedia origins are dropped.
 */
export const KIDS_CONNECT_SRC = "connect-src 'self'";

const DEFAULT_WS_ORIGIN = "wss://ws.puggietype.com";
const SCRIPT_RE = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
const JS_TYPE_RE = /\btype\s*=\s*["']?(module|text\/javascript)["']?/i;

/** CSP sources ('sha256-...') for the inline scripts in the given html files */
export function inlineScriptHashes(htmls: string[]): string[] {
  const hashes = new Set<string>();
  for (const html of htmls) {
    for (const [, attrs = "", body = ""] of html.matchAll(SCRIPT_RE)) {
      if (/\bsrc\s*=/i.test(attrs)) continue;
      if (/\btype\s*=/i.test(attrs) && !JS_TYPE_RE.test(attrs)) continue;
      const digest = createHash("sha256").update(body).digest("base64");
      hashes.add(`'sha256-${digest}'`);
    }
  }
  return [...hashes];
}

/** origin of VITE_WS_URL for connect-src, else the production server */
export function wsOrigin(configured: string | undefined): string {
  if (configured === undefined || configured === "") return DEFAULT_WS_ORIGIN;
  const url = new URL(configured);
  return `${url.protocol}//${url.host}`;
}

/**
 * Appends sources to CSP directives (a `'none'` value is replaced). Every
 * directive must already exist, so a typo can't silently widen nothing.
 */
export function addCspSources(
  headers: string,
  sources: Record<string, string[]>,
): string {
  let out = headers;
  for (const [directive, values] of Object.entries(sources)) {
    const re = new RegExp(
      `(Content-Security-Policy:[^\\n]*?\\b${directive}) ([^;\\n]*)`,
      "g",
    );
    if (out.match(re) === null) throw new Error(`CSP has no ${directive}`);
    out = out.replace(re, (_m, head: string, current: string) => {
      const kept = current.trim() === "'none'" ? [] : [current.trim()];
      return `${head} ${[...kept, ...values].join(" ")}`;
    });
  }
  return out;
}

/** websocket origin plus the http(s) origin used for /leaderboards */
export function connectSrcOrigins(configured: string | undefined): string {
  const ws = wsOrigin(configured);
  const http = ws
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://");
  return http === ws ? ws : `${ws} ${http}`;
}

function firstCspPolicy(headers: string): string {
  for (const line of headers.split("\n")) {
    const match = /^\s*Content-Security-Policy:\s*(.*)$/.exec(line);
    if (match?.[1] !== undefined) return match[1].trim();
  }
  throw new Error("CSP has no Content-Security-Policy");
}

/** replaces the directive named by `value`'s first token, or appends it */
export function withDirective(policy: string, value: string): string {
  const name = value.split(/\s+/)[0] ?? "";
  const parts = policy.split(";").map((part) => part.trim());
  const index = parts.findIndex(
    (part) => part === name || part.startsWith(`${name} `),
  );
  if (index === -1) return [...parts, value].join("; ");
  parts[index] = value;
  return parts.join("; ");
}

/** the catch-all policy without Google hosts, with same-origin img/connect-src */
export function kidsCspPolicy(policy: string): string {
  return withDirective(
    withDirective(cspWithoutAnalyticsAds(policy), KIDS_IMG_SRC),
    KIDS_CONNECT_SRC,
  );
}

/**
 * Pages joins a repeated header with a comma. A second CSP on these paths
 * would keep the catch-all policy, Google origins included. Detach, then set
 * one policy that has no Google hosts and same-origin img-src and connect-src.
 */
export function kidsCspRules(policy: string): string {
  const strict = kidsCspPolicy(policy);
  const rules = KIDS_CSP_PATHS.map(
    (rulePath) =>
      `${rulePath}\n  ! Content-Security-Policy\n  Content-Security-Policy: ${strict}\n`,
  ).join("\n");
  return `# Kids guides. Detach the catch-all CSP, then set one policy without Google hosts and with img-src 'self' only.\n${rules}`;
}

/** built html files of the kids guides, relative to outDir */
export const KIDS_HTML_FILES = [
  ...new Set(
    KIDS_CSP_PATHS.map((p) => `${p.replace(/\/$/, "").slice(1)}.html`),
  ),
];

const META_CSP_RE =
  /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy/i;
const META_CHARSET_RE = /<meta\b[^>]*\bcharset\s*=[^>]*>/i;

/**
 * Puts the kids policy in a <meta> right after <meta charset>, ahead of every
 * script, so the page keeps it if the _headers rule is not applied.
 * frame-ancestors is dropped: a meta CSP ignores it (the header keeps it).
 */
export function withKidsMetaCsp(html: string, kidsPolicy: string): string {
  if (META_CSP_RE.test(html)) {
    throw new Error("kids html already has a CSP meta");
  }
  const content = kidsPolicy
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !/^frame-ancestors\b/.test(part))
    .join("; ")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");
  const charset = META_CHARSET_RE.exec(html);
  if (charset === null) throw new Error("kids html has no <meta charset>");
  const at = charset.index + charset[0].length;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${content}">`;
  return `${html.slice(0, at)}${meta}${html.slice(at)}`;
}

export function renderHeaders(
  template: string,
  values: {
    scriptHashes: string[];
    wsOrigin: string;
    extraCsp?: Record<string, string[]>;
  },
): string {
  const rendered = template
    .replaceAll("__SCRIPT_HASHES__", values.scriptHashes.join(" "))
    .replaceAll("__WS_ORIGIN__", values.wsOrigin);
  const withExtra =
    values.extraCsp === undefined
      ? rendered
      : addCspSources(rendered, values.extraCsp);
  const base = withExtra.endsWith("\n") ? withExtra : `${withExtra}\n`;
  return `${base}\n${kidsCspRules(firstCspPolicy(withExtra))}`;
}

/**
 * Fills the CSP placeholders of the Cloudflare Pages `_headers` file copied
 * from static/: hashes of the final (minified) inline scripts and the WS origin.
 * Then writes the kids policy into the kids guide html as a meta CSP.
 */
export function pagesHeaders(options: {
  wsUrl: string | undefined;
  extraCsp?: Record<string, string[]>;
}): Plugin {
  let outDir = path.resolve("./dist");
  return {
    name: "pages-headers",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const headersPath = path.join(outDir, "_headers");
      if (!existsSync(headersPath)) return;
      const htmls = readdirSync(outDir)
        .filter((f) => f.endsWith(".html"))
        .map((f) => readFileSync(path.join(outDir, f), "utf8"));
      const rendered = renderHeaders(readFileSync(headersPath, "utf8"), {
        scriptHashes: inlineScriptHashes(htmls),
        wsOrigin: connectSrcOrigins(options.wsUrl),
        extraCsp: options.extraCsp,
      });
      writeFileSync(headersPath, rendered);
      const kidsPolicy = kidsCspPolicy(firstCspPolicy(rendered));
      for (const file of KIDS_HTML_FILES) {
        const htmlPath = path.join(outDir, file);
        const html = readFileSync(htmlPath, "utf8");
        writeFileSync(htmlPath, withKidsMetaCsp(html, kidsPolicy));
      }
    },
  };
}
