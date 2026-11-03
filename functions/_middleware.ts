// Pages middleware: www -> apex 301, HSTS on what it serves, and a backstop
// 404 for missing assets.
//
// Missing hashed assets are handled WITHOUT this function: dist has a
// top-level 404.html (vite-plugins/not-found-page.ts), which turns off Pages'
// SPA fallback, so an unknown /js/... gets a 404 instead of index.html with
// the immutable 1-year Cache-Control (2026-11-03 blank-site incident,
// puggietype.CR9YH8lL.js). _routes.json excludes the asset prefixes so they
// never cost a Functions invocation (free plan: 100k/day). The guard below is
// a backstop only, in case an asset prefix is ever routed here again.

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

  const res = await ctx.next();

  if (isAssetPath(url.pathname) && (res.status === 404 || isHtml(res))) {
    // drain the fallback body; send a tiny uncacheable 404 instead
    await res.body?.cancel();
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

  // HSTS on everything the function serves too (robots.txt etc.), so an edge
  // copy cached without _headers can't drop it
  const out = new Response(res.body, res);
  out.headers.set("Strict-Transport-Security", HSTS);
  return out;
};
