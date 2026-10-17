import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const staticDir = path.resolve(__dirname, "../static");
const srcDir = path.resolve(__dirname, "../src");

// cloudflare pages disables its spa fallback when dist has a 404.html,
// so every spa route needs a rewrite to /index.html in _redirects
describe("static routing", () => {
  const rewrites = readFileSync(path.join(staticDir, "_redirects"), "utf-8")
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(([, to, code]) => to === "/index.html" && code === "200")
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
});
