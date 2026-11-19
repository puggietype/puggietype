// Pages middleware: www -> apex 301, HSTS on what it serves, and a backstop
// 404 for missing assets. It does not set cookies. A previously issued
// country cookie expires on its own.
//
// Missing hashed assets are handled WITHOUT this function: dist has a
// top-level 404.html (vite-plugins/not-found-page.ts), which turns off Pages'
// SPA fallback, so an unknown /js/... gets a 404 instead of index.html with
// the immutable 1-year Cache-Control (2026-11-03 blank-site incident,
// puggietype.CR9YH8lL.js). _routes.json excludes the asset prefixes so they
// never cost a Functions invocation (free plan: 100k/day). The guard below is
// a backstop only, in case an asset prefix is ever routed here again.
//
// Kids guides: the GA-free CSP in _headers matches exact paths only, but the
// asset server also serves those pages for /guide//teaching-kids-to-type,
// /guide/teaching-kids-to-typ%65, /guide%2Fteaching-kids-to-type etc. with
// the catch-all CSP. Those 301 to the canonical page (or 404 for %2F).

import {
  KIDS_CANONICAL_PATH,
  KIDS_CSP_PATHS,
} from "../frontend/vite-plugins/kids-csp-paths";

export const ASSET_PREFIXES = [
  "/js/",
  "/css/",
  "/webfonts/",
  "/assets/",
  "/images/",
];

export function isAssetPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return ASSET_PREFIXES.some((p) => lower.startsWith(p));
}

function isHtml(res: Response): boolean {
  return (res.headers.get("Content-Type") ?? "").includes("text/html");
}

const HSTS = "max-age=31536000; includeSubDomains";
const CANONICAL_ORIGIN = "https://puggietype.com";
const KIDS_PATHS: ReadonlySet<string> = new Set(KIDS_CSP_PATHS);
const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/**
 * Decodes percent-encoded unreserved characters (RFC 3986 2.3) and collapses
 * repeated slashes. Reserved escapes such as %2F stay encoded (they are data,
 * not a separator). Malformed escapes are left as they are; never throws.
 */
export function normalizePath(pathname: string): string {
  return pathname
    .replace(/%([0-9A-Fa-f]{2})/g, (escape, hex: string) => {
      const char = String.fromCharCode(parseInt(hex, 16));
      return UNRESERVED.test(char) ? char : escape;
    })
    .replace(/\/{2,}/g, "/");
}

/** canonical kids URL for a non-canonical spelling of a kids path */
export function kidsRedirect(url: URL): string | undefined {
  const normalized = normalizePath(url.pathname);
  if (normalized === url.pathname || !KIDS_PATHS.has(normalized)) {
    return undefined;
  }
  return `${CANONICAL_ORIGIN}${KIDS_CANONICAL_PATH}${url.search}`;
}

/**
 * /guide%2Fteaching-kids-to-type names one segment that doesn't exist, but
 * the asset server decodes %2F and serves the kids page with the catch-all
 * CSP. Not a spelling of the kids path, so 404 rather than redirect.
 */
export function isEncodedSlashKidsPath(pathname: string): boolean {
  if (!/%2f/i.test(pathname)) return false;
  return KIDS_PATHS.has(normalizePath(pathname.replace(/%2f/gi, "/")));
}

function notFound(): Response {
  return new Response("Not found\n", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Strict-Transport-Security": HSTS,
    },
  });
}

export const onRequest = async (ctx: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> => {
  const url = new URL(ctx.request.url);
  if (url.hostname === "www.puggietype.com") {
    url.hostname = "puggietype.com";
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }

  const kids = kidsRedirect(url);
  if (kids !== undefined) {
    return new Response(null, {
      status: 301,
      headers: { Location: kids, "Strict-Transport-Security": HSTS },
    });
  }
  if (isEncodedSlashKidsPath(url.pathname)) return notFound();

  const res = await ctx.next();

  if (isAssetPath(url.pathname) && (res.status === 404 || isHtml(res))) {
    // drain the fallback body; send a tiny uncacheable 404 instead
    await res.body?.cancel();
    return notFound();
  }

  // HSTS on everything the function serves too (robots.txt etc.), so an edge
  // copy cached without _headers can't drop it
  const out = new Response(res.body, res);
  out.headers.set("Strict-Transport-Security", HSTS);
  return out;
};
