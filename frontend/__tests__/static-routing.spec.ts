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

  const sitemapPaths = [
    ...readFileSync(path.join(staticDir, "sitemap.xml"), "utf-8").matchAll(
      /<loc>https:\/\/puggietype\.com(\/[^<]*)<\/loc>/g,
    ),
  ].map((m) => m[1] ?? "");

  it("lists the launch pages in the sitemap", () => {
    expect(sitemapPaths).toEqual([
      "/",
      "/race",
      "/about",
      "/settings",
      "/terms",
      "/privacy",
    ]);
  });

  it("serves every sitemap path from an html file or a spa rewrite", () => {
    for (const p of sitemapPaths) {
      const page = p === "/" ? "index" : p.slice(1);
      const servable =
        existsSync(path.join(srcDir, `${page}.html`)) || rewrites.includes(p);
      expect(servable, p).toBe(true);
    }
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
