import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Plugin } from "vite";

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
 * Google AdSense and its consent message (Privacy & messaging), the only
 * third-party origins ads may add (legal/ads-changeset.md §4).
 */
export const AD_ORIGINS = [
  "https://*.googlesyndication.com",
  "https://*.doubleclick.net",
  "https://fundingchoicesmessages.google.com",
  "https://*.google.com",
  "https://*.gstatic.com",
  "https://*.adtrafficquality.google",
];

// img-src already allows https:
const AD_DIRECTIVES = ["script-src", "connect-src", "frame-src"];

/** adds AD_ORIGINS to the directives ad code needs (frame-src 'none' is replaced) */
export function widenCspForAds(headers: string): string {
  return headers.replace(
    /^(\s*Content-Security-Policy:\s*)(.*)$/m,
    (_, prefix: string, policy: string) => {
      const directives = policy.split(";").map((d) => d.trim());
      const widened = directives.map((directive) => {
        const [name = "", ...sources] = directive.split(/\s+/);
        if (!AD_DIRECTIVES.includes(name)) return directive;
        const kept = sources.filter((s) => s !== "'none'");
        const added = AD_ORIGINS.filter((o) => !kept.includes(o));
        return [name, ...kept, ...added].join(" ");
      });
      return `${prefix}${widened.join("; ")}`;
    },
  );
}

export function renderHeaders(
  template: string,
  values: { scriptHashes: string[]; wsOrigin: string; adsEnabled?: boolean },
): string {
  const rendered = template
    .replaceAll("__SCRIPT_HASHES__", values.scriptHashes.join(" "))
    .replaceAll("__WS_ORIGIN__", values.wsOrigin);
  return values.adsEnabled === true ? widenCspForAds(rendered) : rendered;
}

/**
 * Fills the CSP placeholders of the Cloudflare Pages `_headers` file copied
 * from static/: hashes of the final (minified) inline scripts and the WS origin.
 * Ads-enabled builds also get the Google ad origins; others stay unchanged.
 */
export function pagesHeaders(options: {
  wsUrl: string | undefined;
  /** VITE_ADS_ENABLED=true builds: allow the Google ad origins */
  adsEnabled?: boolean;
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
        wsOrigin: wsOrigin(options.wsUrl),
        adsEnabled: options.adsEnabled,
      });
      writeFileSync(headersPath, rendered);
    },
  };
}
