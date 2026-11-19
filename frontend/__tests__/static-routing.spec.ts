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
    "/guide/teaching-kids-to-type",
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
    const home = readFileSync(path.join(srcDir, "index.html"), "utf-8");
    expect(home).toContain('src="html/site-intro.html"');
    expect(intro).toContain("PuggieType is a free, minimalist typing test");
    expect(intro).toContain('<a href="/guide/">typing guides</a>');
    const oldSlug = "/guide/typing-for-kids";
    expect(index).not.toContain(oldSlug);
    expect(footer).not.toContain(oldSlug);
    expect(intro).not.toContain(oldSlug);
    expect(home).not.toContain(oldSlug);
    expect(sitemapPaths).not.toContain(oldSlug);
    const parentsGuide = "/guide/teaching-kids-to-type";
    expect(index).toContain(`href="${parentsGuide}"`);
    expect(index).toContain(
      "Teaching kids to type: a guide for parents and teachers",
    );
    expect(index).toContain("<h2>For parents and teachers</h2>");
    expect(footer).not.toContain(parentsGuide);
    expect(intro).not.toContain(parentsGuide);
    expect(home).not.toContain(parentsGuide);
    expect(sitemapPaths.filter((p) => p === parentsGuide)).toEqual([
      parentsGuide,
    ]);
  });

  it("indexes the teaching-kids guide and redirects the old slug", () => {
    const page = readFileSync(
      path.join(srcDir, "guide/teaching-kids-to-type.html"),
      "utf-8",
    );
    const oldPage = readFileSync(
      path.join(srcDir, "guide/typing-for-kids.html"),
      "utf-8",
    );
    expect(page).not.toMatch(/<meta\b[^>]*name=["']robots["']/i);
    expect(page.toLowerCase()).not.toContain("noindex");
    expect(oldPage).toContain(
      '<meta name="robots" content="noindex, nofollow"',
    );
    expect(page).toContain("There are no ads during a test or race.");
    expect(page).toContain(
      "Teaching kids to type: a parent-teacher guide | PuggieType",
    );
    expect(page).toContain(
      "A parent and teacher guide to helping children learn touch typing: readiness, desk setup, short sessions, and accuracy first. PuggieType is for ages 13+.",
    );
    expect(page).not.toMatch(/child-directed|max-ad-content-rating|coppa/i);
    const lines = redirectsFile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("/"));
    expect(lines).toContain(
      "/guide/typing-for-kids /guide/teaching-kids-to-type 301",
    );
    expect(lines).toContain(
      "/guide/typing-for-kids/ /guide/teaching-kids-to-type 301",
    );
    expect(lines).toContain("/about /guide/about 301");
    expect(lines).toContain("/about/ /guide/about 301");
    expect(lines).not.toContain("/about / 200");
  });

  it("stamps a hand-set last-updated date that matches dateModified", () => {
    const stamped = [
      ...staticPages.filter((p) => p.startsWith("/guide/")),
      "/faq",
    ];
    for (const p of stamped) {
      const html = readFileSync(
        path.join(srcDir, `${p.slice(1)}.html`),
        "utf-8",
      );
      const visible =
        /<p class="last-updated">Last updated <time datetime="(\d{4}-\d{2}-\d{2})">/.exec(
          html,
        );
      const modified = /"dateModified": "(\d{4}-\d{2}-\d{2})"/.exec(html);
      expect(visible, p).not.toBeNull();
      expect(modified?.[1], p).toBe(visible?.[1]);
    }
    const tips = readFileSync(
      path.join(srcDir, "guide/typing-tips.html"),
      "utf-8",
    );
    for (const href of [
      "/guide/type-faster",
      "/guide/improve-accuracy",
      "/guide/home-row-finger-placement",
      "/guide/typing-ergonomics",
      "/guide/keyboard-layouts",
      "/guide/modes-settings",
      "/guide/multiplayer",
    ]) {
      expect(tips, href).toContain(`href="${href}"`);
    }
    expect(tips).toContain(
      '<a href="/guide/keyboard-layouts">keyboard layouts guide</a>',
    );
    expect(tips).toContain("Multiplayer is for ages 13 and over.");
    const faster = readFileSync(
      path.join(srcDir, "guide/type-faster.html"),
      "utf-8",
    );
    expect(faster).toContain(
      '<a href="/guide/keyboard-layouts">keyboard layouts guide</a>',
    );
    const ergo = readFileSync(
      path.join(srcDir, "guide/typing-ergonomics.html"),
      "utf-8",
    );
    expect(ergo).toContain("The best posture is your next one.");
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
