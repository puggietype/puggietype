import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const staticDir = path.resolve(__dirname, "../static");
const srcDir = path.resolve(__dirname, "../src");

// cloudflare pages: _redirects rules beat real files, and a rewrite to
// /index.html is dropped as an infinite loop (verified with wrangler pages dev).
// spa routes rewrite to /, and no 404.html keeps pages' own spa fallback on
describe("static routing", () => {
  const redirectsFile = readFileSync(
    path.join(staticDir, "_redirects"),
    "utf-8",
  );
  const rewrites = redirectsFile
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((rule) => rule[0]?.startsWith("/") === true)
    .filter(([, to, code]) => to === "/" && code === "200")
    .map(([from]) => from);

  // plain html pages (src/<path>.html), served by pages at the clean url
  const staticPages = [
    "/guide/about",
    "/faq",
    "/guide/wpm-accuracy",
    "/guide/typing-tips",
    "/guide/multiplayer",
    "/guide/modes-settings",
    "/guide/touch-typing-beginners",
    "/guide/home-row-finger-placement",
    "/guide/type-faster",
    "/guide/keyboard-layouts",
    "/guide/typing-ergonomics",
    "/guide/typing-test-math",
    "/guide/improve-accuracy",
    "/guide/typing-for-kids",
    "/contact",
    "/creators",
  ];

  const sitemapPaths = [
    ...readFileSync(path.join(staticDir, "sitemap.xml"), "utf-8").matchAll(
      /<loc>https:\/\/puggietype\.com(\/[^<]*)<\/loc>/g,
    ),
  ].map((m) => m[1] ?? "");

  it("lists the launch pages in the sitemap", () => {
    expect(sitemapPaths).toEqual([
      "/",
      "/guide/",
      ...staticPages,
      "/terms",
      "/privacy",
    ]);
  });

  it("builds each static content page and never shadows it with a rule", () => {
    const viteConfig = readFileSync(
      path.resolve(__dirname, "../vite.config.ts"),
      "utf-8",
    );
    const rules = redirectsFile
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((from) => from?.startsWith("/") === true);
    for (const p of staticPages) {
      expect(existsSync(path.join(srcDir, `${p.slice(1)}.html`)), p).toBe(true);
      expect(viteConfig, p).toContain(`"src${p}.html"`);
      expect(rules, p).not.toContain(p);
    }
    // /guide/ is guide/index.html. A _redirects rule would beat that file.
    expect(existsSync(path.join(srcDir, "guide/index.html"))).toBe(true);
    expect(viteConfig).toContain('"src/guide/index.html"');
    expect(rules).not.toContain("/guide/");
  });

  it("serves every sitemap path from an html file or a spa rewrite", () => {
    for (const p of sitemapPaths) {
      const page =
        p === "/"
          ? "index"
          : p.endsWith("/")
            ? `${p.slice(1)}index`
            : p.slice(1);
      const servable =
        existsSync(path.join(srcDir, `${page}.html`)) || rewrites.includes(p);
      expect(servable, p).toBe(true);
    }
  });

  it("canonicalizes /guide to the index and does not send either path home", () => {
    const lines = redirectsFile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("/"));
    expect(lines).toContain("/guide /guide/ 301");
    expect(lines).not.toContain("/guide / 301");
    expect(lines).not.toContain("/guide/ / 301");
  });

  it("links every guide from the index, with no ad or analytics scripts", () => {
    const index = readFileSync(path.join(srcDir, "guide/index.html"), "utf-8");
    for (const p of staticPages.filter((page) => page.startsWith("/guide/"))) {
      expect(index, p).toContain(`href="${p}"`);
    }
    expect(index).toContain('href="https://puggietype.com/guide/"');
    expect(index).not.toMatch(
      /adsbygoogle|gtag\(|google-analytics|plausible|umami|cloudflareinsights|beacon\.min\.js/i,
    );
    const footer = readFileSync(
      path.join(srcDir, "html/static-page/footer.html"),
      "utf-8",
    );
    const intro = readFileSync(
      path.join(srcDir, "html/site-intro.html"),
      "utf-8",
    );
    expect(footer).toContain('href="/guide/"');
    expect(intro).toContain('href="/guide/"');
  });

  it("rewrites race invite links", () => {
    expect(rewrites).toContain("/r/*");
  });

  it("keeps cloudflare's spa fallback on: no 404.html page, no splat", () => {
    expect(existsSync(path.join(srcDir, "404.html"))).toBe(false);
    expect(existsSync(path.join(staticDir, "404.html"))).toBe(false);
    expect(rewrites).not.toContain("/*");
    expect(redirectsFile).not.toMatch(/\/index\.html 200/);
  });
});
