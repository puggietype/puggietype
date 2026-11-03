import { Plugin } from "vite";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Writes dist/404.html (a copy of the final index.html).
 *
 * With a top-level 404.html, Cloudflare Pages turns OFF its SPA fallback: an
 * unknown path gets this page with status 404 instead of index.html with 200.
 * That is what keeps a missing hashed /js or /css file (deploy race) from being
 * answered, and edge-cached for a year, as HTML. The real SPA routes are
 * rewritten to / in static/_redirects; any other path renders the app's own
 * 404 page (same app, so same UX) with a real 404 status.
 *
 * The copy drops <link rel="canonical"> and adds <meta name="robots"
 * content="noindex"> so a 404 is never indexed as the home page.
 *
 * Must run after the plugins that rewrite index.html and before pages-headers
 * (which hashes inline scripts of every top-level html file).
 */
export function notFoundPage(): Plugin {
  let outDir = path.resolve("./dist");
  return {
    name: "not-found-page",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const index = path.join(outDir, "index.html");
      if (!existsSync(index)) return;
      writeFileSync(
        path.join(outDir, "404.html"),
        toNotFoundHtml(readFileSync(index, "utf8")),
      );
    },
  };
}

/** index.html -> 404.html: no canonical, plus robots noindex. */
export function toNotFoundHtml(html: string): string {
  let out = html.replace(/<link\b[^>]*\brel=["']?canonical["']?[^>]*>/gi, "");
  if (!/<meta\b[^>]*name=["']?robots["']?/i.test(out)) {
    const tag = '<meta name="robots" content="noindex">';
    out = /<head[^>]*>/i.test(out)
      ? out.replace(/<head[^>]*>/i, (m) => m + tag)
      : tag + out;
  }
  return out;
}
