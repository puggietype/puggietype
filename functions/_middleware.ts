// Pages middleware: www -> apex 301, HSTS on everything, and a real 404 for
// missing hashed assets.
//
// Why the 404: dist has no 404.html, so Pages answers ANY unknown path with
// index.html (200). For /js/* and /css/* that fallback also picked up the
// "immutable, 1 year" Cache-Control from _headers, so if the edge was asked
// for a new hash before that file was live (deploy race), it cached the HTML
// under the JS URL for a year. Browsers then loaded HTML as the app's entry
// module and the site went blank (2026-11-03, puggietype.CR9YH8lL.js).
// A missing asset must be an uncacheable 404, never the SPA page.

export const ASSET_PREFIXES = ["/js/", "/css/", "/webfonts/", "/assets/"];

export function isAssetPath(pathname: string): boolean {
  return ASSET_PREFIXES.some((p) => pathname.startsWith(p));
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
