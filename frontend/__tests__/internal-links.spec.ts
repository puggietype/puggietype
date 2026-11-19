import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ViteMinifyPlugin } from "vite-plugin-minify";

import { EMAIL_OFF, EMAIL_ON, KEEP_COMMENTS } from "../vite-plugins/email-off";
import { renderLegalMarkdown } from "../vite-plugins/legal-markdown";

const staticDir = path.resolve(__dirname, "../static");
const srcDir = path.resolve(__dirname, "../src");
const ORIGIN = "https://puggietype.com";

const redirectsFile = readFileSync(path.join(staticDir, "_redirects"), "utf-8");
// cloudflare pages: a rule without a status code is a 302
const rules = redirectsFile
  .split("\n")
  .map((line) => line.trim().split(/\s+/))
  .filter((rule) => rule[0]?.startsWith("/") === true)
  .map(([from = "", to = "", code = "302"]) => ({ from, to, code }));
const matches = (from: string, p: string): boolean =>
  from.endsWith("/*") ? p.startsWith(from.slice(0, -1)) : from === p;

const sitemapPaths = [
  ...readFileSync(path.join(staticDir, "sitemap.xml"), "utf-8").matchAll(
    /<loc>https:\/\/puggietype\.com(\/[^<]*)<\/loc>/g,
  ),
].map((m) => m[1] ?? "");

// html pages vite builds: src/<page>.html -> dist/<page>.html
const pages = new Set(
  [
    ...readFileSync(
      path.resolve(__dirname, "../vite.config.ts"),
      "utf-8",
    ).matchAll(/"src\/([\w/-]+)\.html"/g),
  ].map((m) => m[1] ?? ""),
);

/** why a full-page load of `p` would not be a plain 200, or undefined */
function linkProblem(p: string): string | undefined {
  if (p.startsWith("/cdn-cgi/")) return "reserved by cloudflare";
  const rule = rules.find((r) => matches(r.from, p));
  if (rule !== undefined && rule.code !== "200") {
    return `${rule.code} to ${rule.to}`;
  }
  if (rule !== undefined || p === "/") return undefined;
  const page = p.slice(1);
  // pages 308s /x.html to /x, /x/ to /x, and /dir to /dir/
  if (page.endsWith(".html") && pages.has(page.slice(0, -5))) {
    return "html extension redirects";
  }
  if (p.endsWith("/")) {
    if (pages.has(`${page}index`)) return undefined;
    return pages.has(page.slice(0, -1)) ? "trailing slash redirects" : "404";
  }
  if (pages.has(page)) return undefined;
  if (pages.has(`${page}/index`)) return "redirects to the trailing slash";
  if (existsSync(path.join(staticDir, page))) return undefined;
  if (existsSync(path.join(srcDir, page))) return undefined; // vite asset
  return "404";
}

/** source page as the build sees it: html partials and legal markdown inlined */
function renderPage(page: string): string {
  const inline = (html: string): string =>
    html.replace(/<load src="([^"]+)" \/>/g, (_, src: string) =>
      inline(readFileSync(path.join(srcDir, src), "utf-8")),
    );
  return renderLegalMarkdown(
    inline(readFileSync(path.join(srcDir, `${page}.html`), "utf-8")),
    path.join(srcDir, "legal"),
  );
}

const pageOf = (p: string): string =>
  p === "/" ? "index" : p.endsWith("/") ? `${p.slice(1)}index` : p.slice(1);

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi;
const withoutEmailOff = (html: string): string =>
  html.replace(/<!--email_off-->[\s\S]*?<!--\/email_off-->/g, "");

describe("internal links", () => {
  it("flags redirecting, reserved and missing paths", () => {
    expect(linkProblem("/about")).toBe("301 to /guide/about");
    expect(linkProblem("/guide")).toBe("301 to /guide/");
    expect(linkProblem("/leaderboard")).toBe("301 to /leaderboards");
    expect(linkProblem("/guide/typing-for-kids")).toMatch(/^301/);
    expect(linkProblem("/faq/")).toBe("trailing slash redirects");
    expect(linkProblem("/faq.html")).toBe("html extension redirects");
    expect(linkProblem("/cdn-cgi/l/email-protection")).toBe(
      "reserved by cloudflare",
    );
    expect(linkProblem("/no-such-page")).toBe("404");
    for (const ok of ["/", "/guide/", "/faq", "/race", "/r/abc", "/ads.txt"]) {
      expect(linkProblem(ok), ok).toBeUndefined();
    }
  });

  it("sitemap lists only canonical 200 paths, and robots.txt points to it", () => {
    expect(sitemapPaths.length).toBeGreaterThan(0);
    for (const p of sitemapPaths) {
      expect(linkProblem(p), p).toBeUndefined();
      expect(pages.has(pageOf(p)), p).toBe(true);
    }
    expect(readFileSync(path.join(staticDir, "robots.txt"), "utf-8")).toMatch(
      /^Sitemap: https:\/\/puggietype\.com\/sitemap\.xml$/m,
    );
  });

  for (const p of sitemapPaths) {
    describe(p, () => {
      const html = renderPage(pageOf(p));
      const url = `${ORIGIN}${p}`;

      it("links internally only to 200 pages", () => {
        const hrefs = [...html.matchAll(/<(?:a|link)\b[^>]*\shref="([^"]*)"/g)]
          .map((m) => m[1] ?? "")
          .filter((href) => href !== "" && !href.startsWith("#"))
          .map((href) => new URL(href, url))
          .filter((u) => u.protocol === "https:" && u.origin === ORIGIN);
        expect(hrefs.length).toBeGreaterThan(0);
        for (const u of hrefs) {
          expect(linkProblem(u.pathname), u.href).toBeUndefined();
        }
        expect(html).not.toContain("/cdn-cgi/");
      });

      it("keeps every email address inside email_off", () => {
        expect(withoutEmailOff(html).match(EMAIL)).toBeNull();
        expect(html.split(EMAIL_OFF).length).toBe(html.split(EMAIL_ON).length);
      });

      it("canonical, og:url and JSON-LD url are this sitemap url", () => {
        const tags = [...html.matchAll(/<(?:link|meta)\b([^>]*)>/g)].map(
          (m) =>
            Object.fromEntries(
              [...(m[1] ?? "").matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [
                a[1],
                a[2],
              ]),
            ) as Record<string, string | undefined>,
        );
        const canonical = tags.filter((t) => t["rel"] === "canonical");
        const ogUrl = tags.filter((t) => t["property"] === "og:url");
        expect(canonical.map((t) => t["href"])).toEqual([url]);
        expect(ogUrl.map((t) => t["content"])).toEqual([url]);
        const blocks = [
          ...html.matchAll(
            /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
          ),
        ].map((m) => JSON.parse(m[1] ?? "") as Record<string, unknown>);
        expect(blocks.length).toBeGreaterThan(0);
        expect(blocks[0]?.["url"]).toBe(url);
        const ldUrls = JSON.stringify(blocks).match(
          /https:\/\/puggietype\.com\/[^"]*/g,
        );
        for (const ldUrl of ldUrls ?? []) {
          const ldPath = new URL(ldUrl).pathname;
          if (/\.\w+$/.test(ldPath)) continue; // images
          expect(sitemapPaths, ldUrl).toContain(ldPath);
        }
      });
    });
  }

  it("the html minifier keeps the email_off comments", async () => {
    const plugin = ViteMinifyPlugin({ ignoreCustomComments: KEEP_COMMENTS });
    const hook = plugin.transformIndexHtml as {
      handler: (html: string) => Promise<string>;
    };
    const out = await hook.handler(
      `<p>Email <!--email_off--><a href="mailto:a@b.co">a@b.co</a><!--/email_off-->.<!-- dropped --></p>`,
    );
    expect(out).toBe(
      `<p>Email <!--email_off--><a href="mailto:a@b.co">a@b.co</a><!--/email_off-->.</p>`,
    );
  });
});
