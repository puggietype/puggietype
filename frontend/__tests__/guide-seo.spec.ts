import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const staticDir = path.resolve(__dirname, "../static");
const srcDir = path.resolve(__dirname, "../src");

const sitemap = readFileSync(path.join(staticDir, "sitemap.xml"), "utf-8");
const sitemapEntries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(
  (m) => ({
    path:
      /<loc>https:\/\/puggietype\.com(\/[^<]*)<\/loc>/.exec(m[1] ?? "")?.[1] ??
      "",
    lastmod: /<lastmod>([^<]*)<\/lastmod>/.exec(m[1] ?? "")?.[1],
  }),
);

// guides and the faq: the hand-written content pages
const pagePaths = sitemapEntries
  .map((e) => e.path)
  .filter((p) => p.startsWith("/guide/") || p === "/faq");

// pages reworked for search (title/description length, faq, wording rules)
const SEO_PAGES = [
  "/guide/touch-typing-beginners",
  "/guide/wpm-accuracy",
  "/guide/home-row-finger-placement",
  "/guide/multiplayer",
];
const FAQ_REQUIRED = [
  "/guide/touch-typing-beginners",
  "/guide/wpm-accuracy",
  "/guide/home-row-finger-placement",
];
const FORBIDDEN = [
  /\bbest\b/i,
  /#1\b/,
  /\bofficial\b/i,
  /\bguarantee/i,
  /\bno ads\b/i,
  /carpal|\bRSI\b|repetitive strain|injur/i,
];

const pageOf = (p: string): string =>
  p.endsWith("/") ? `${p.slice(1)}index` : p.slice(1);

/** source page with html partials inlined, as the build sees it */
function renderPage(page: string): string {
  const inline = (html: string): string =>
    html.replace(/<load src="([^"]+)" \/>/g, (_, src: string) =>
      inline(readFileSync(path.join(srcDir, src), "utf-8")),
    );
  return inline(readFileSync(path.join(srcDir, `${page}.html`), "utf-8"));
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const decode = (s: string): string =>
  s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number(code.slice(1)));
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
/** tags stripped, entities decoded, whitespace collapsed */
const plain = (html: string): string =>
  decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
/** like plain, but without adding spaces where inline tags were */
const inlineText = (html: string): string =>
  decode(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, attr: "name" | "property", key: string): string[] {
  return [...html.matchAll(/<meta\b([^>]*)>/g)]
    .map((m) => m[1] ?? "")
    .filter((a) => a.includes(`${attr}="${key}"`))
    .map((a) => /content="([^"]*)"/.exec(a)?.[1] ?? "");
}

type Ld = Record<string, unknown>;
const ldBlocks = (html: string): Ld[] =>
  [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => JSON.parse(m[1] ?? "") as Ld);

const mainOf = (html: string): string =>
  /<main>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? "";

const pages = pagePaths.map((p) => {
  const html = renderPage(pageOf(p));
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
  return { path: p, html, title };
});

describe("guide seo", () => {
  it("covers the guides and the faq", () => {
    expect(pagePaths).toContain("/faq");
    for (const p of SEO_PAGES) expect(pagePaths).toContain(p);
  });

  it("gives every page a unique title", () => {
    const titles = pages.map((p) => p.title);
    for (const p of pages) expect(p.title, p.path).not.toBe("");
    expect(new Set(titles).size).toBe(titles.length);
  });

  for (const { path: p, html, title } of pages) {
    describe(p, () => {
      const description = meta(html, "name", "description");
      const blocks = ldBlocks(html);

      it("keeps titles <= 60 and descriptions <= 155 characters", () => {
        expect(title.length, title).toBeLessThanOrEqual(60);
        expect(description).toHaveLength(1);
        expect(description[0]?.length, description[0]).toBeLessThanOrEqual(155);
      });

      it("repeats the title and description in og, twitter and JSON-LD", () => {
        expect(meta(html, "property", "og:title")).toEqual([title]);
        expect(meta(html, "name", "twitter:title")).toEqual([title]);
        expect(meta(html, "property", "og:description")).toEqual(description);
        expect(meta(html, "name", "twitter:description")).toEqual(description);
        const article = blocks.find((b) => b["@type"] === "Article");
        if (article !== undefined) {
          expect(decode(String(article["description"]))).toBe(
            decode(description[0] ?? ""),
          );
        }
      });

      it("has exactly one h1", () => {
        expect(html.match(/<h1\b/g)).toHaveLength(1);
      });

      it("has FAQPage questions and answers that match the visible text", () => {
        const faqs = blocks.filter((b) => b["@type"] === "FAQPage");
        if (FAQ_REQUIRED.includes(p)) expect(faqs).toHaveLength(1);
        const main = mainOf(html);
        const h3s = [...main.matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map((m) =>
          inlineText(m[1] ?? ""),
        );
        const visible = inlineText(main);
        for (const faq of faqs) {
          const entities = faq["mainEntity"] as Ld[];
          expect(entities.length).toBeGreaterThan(0);
          for (const q of entities) {
            const name = String(q["name"]);
            const answer = (q["acceptedAnswer"] as Ld)["text"];
            expect(q["@type"]).toBe("Question");
            expect(h3s, name).toContain(name);
            expect(visible, name).toContain(
              String(answer).replace(/\s+/g, " ").trim(),
            );
          }
        }
      });
    });
  }

  it("stamps a sitemap lastmod equal to each page's dateModified", () => {
    for (const entry of sitemapEntries) {
      const html = renderPage(
        entry.path === "/" ? "index" : pageOf(entry.path),
      );
      const modified = /"dateModified": "(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1];
      expect(entry.lastmod, entry.path).toBe(modified);
    }
  });

  for (const p of SEO_PAGES) {
    it(`${p} avoids claims we can't stand behind`, () => {
      const page = pages.find((x) => x.path === p);
      const text = plain(
        `${page?.title ?? ""} ${mainOf(page?.html ?? "")} ${meta(page?.html ?? "", "name", "description").join(" ")}`,
      );
      for (const re of FORBIDDEN) expect(text, String(re)).not.toMatch(re);
    });
  }
});
