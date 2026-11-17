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
// wording Legal asked us not to use: superlatives, unsourced stats, health
// claims, ad/tracking promises and brand or affiliation claims
const FORBIDDEN: Record<string, RegExp> = {
  best: /\bbest\b/i,
  "#1": /#1\b/,
  official: /\bofficial(ly)?\b/i,
  guarantee: /\bguarantee\w*/i,
  "no ads": /\bno ads\b/i,
  injury: /carpal|\bRSI\b|repetitive strain|\binjur\w*/i,
  fastest: /\bfastest\b/i,
  top: /\btop\b/i,
  "number one": /\bnumber one\b/i,
  proven: /\bproven\b/i,
  // a typical or average figure, written as wpm or spelled out
  "typical/average wpm":
    /\b(typical|average)\b[^.]{0,40}\b(wpm|words per minute)\b|\b(wpm|words per minute)\b[^.]{0,40}\b(typical|average)\b/i,
  prevent: /\bprevent\w*/i,
  pain: /\bpain(s|ful)?\b/i,
  health: /\bhealth\w*/i,
  "ad-free": /\bad-free\b/i,
  "no tracking": /\bno tracking\b/i,
  Monkeytype: /\bmonkeytype\b/i,
  affiliated: /\baffiliated\b/i,
  endorsed: /\bendorsed\b/i,
};

/**
 * Legitimate uses, removed from the text before the check. Every entry is
 * scoped to one page and must still be on it, so the allowlist can't go stale. Anything
 * not listed here fails: fix the copy or ask Legal before adding an entry.
 */
const ALLOWED: { page: string; phrase: string; why: string }[] = [
  // keyboard geometry, not a ranking claim
  {
    page: "/guide/touch-typing-beginners",
    phrase: "top-row",
    why: "keyboard row",
  },
  {
    page: "/guide/touch-typing-beginners",
    phrase: "top row",
    why: "keyboard row",
  },
  {
    page: "/guide/home-row-finger-placement",
    phrase: "top row",
    why: "keyboard row",
  },
  {
    page: "/guide/home-row-finger-placement",
    phrase: "on top of",
    why: "idiom",
  },
  { page: "/guide/keyboard-layouts", phrase: "on top of", why: "idiom" },
  { page: "/guide/typing-ergonomics", phrase: "top row", why: "keyboard row" },
  {
    page: "/guide/keyboard-layouts",
    phrase: "sit at the top left",
    why: "key position",
  },
  {
    page: "/guide/typing-ergonomics",
    phrase: "the top of the screen",
    why: "monitor height",
  },
  // GPL credit and the non-affiliation line Legal approved (Oct 17)
  {
    page: "/guide/about",
    phrase:
      "built on the open-source Monkeytype codebase, created by Miodec and the Monkeytype contributors",
    why: "GPL-3.0 attribution",
  },
  {
    page: "/guide/about",
    phrase: "is not affiliated with or endorsed by Monkeytype",
    why: "non-affiliation disclaimer",
  },
  // a reader's own results, not a claim about PuggieType
  {
    page: "/guide/type-faster",
    phrase: "not the best",
    why: "median vs best run",
  },
  {
    page: "/guide/type-faster",
    phrase: "personal best",
    why: "pace caret setting",
  },
  {
    page: "/guide/type-faster",
    phrase: "remember only the best runs",
    why: "own results",
  },
  {
    page: "/guide/type-faster",
    phrase: "Progress is fastest at the start",
    why: "learning curve wording, not a speed claim",
  },
  {
    page: "/guide/keyboard-layouts",
    phrase: "It works best during a quiet period",
    why: "advice",
  },
  { page: "/guide/keyboard-layouts", phrase: "is best left on", why: "advice" },
  { page: "/guide/keyboard-layouts", phrase: "less painful", why: "idiom" },
  // Legal-approved line, pinned in static-routing.spec.ts
  {
    page: "/guide/typing-ergonomics",
    phrase: "The best posture is your next one.",
    why: "Legal-approved",
  },
  // safety redirects that tell readers to see a professional (no health claim)
  {
    page: "/guide/type-faster",
    phrase: "persistent pain is a reason to see a professional",
    why: "safety redirect",
  },
  {
    page: "/guide/keyboard-layouts",
    phrase: "If you have pain when typing",
    why: "safety redirect",
  },
  {
    page: "/guide/keyboard-layouts",
    phrase: "talk to a health professional",
    why: "safety redirect",
  },
  {
    page: "/guide/typing-ergonomics",
    phrase: "First, a note about pain",
    why: "disclaimer heading",
  },
  {
    page: "/guide/typing-ergonomics",
    phrase: "we are not health professionals. If you have pain,",
    why: "not-medical-advice disclaimer",
  },
  {
    page: "/guide/typing-ergonomics",
    phrase: "qualified health professional",
    why: "safety redirect",
  },
  {
    page: "/guide/teaching-kids-to-type",
    phrase: "If a child mentions pain",
    why: "safety redirect",
  },
  {
    page: "/guide/teaching-kids-to-type",
    phrase: "much easier to prevent than to undo",
    why: "habit advice, not health",
  },
  // a product claim: the only ad slot is the solo results screen, and races
  // return before it renders (test-logic.ts); no ad provider is wired today
  {
    page: "/guide/teaching-kids-to-type",
    phrase: "There are no ads during a test or race.",
    why: "Legal ruled accurate Nov 17; re-review before ads launch",
  },
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

/**
 * Visible FAQ pairs: each h3 and the text up to the next heading. On guides
 * that is the "Frequently asked questions" h2 section; /faq is all FAQ.
 */
function visibleFaq(main: string): { q: string; a: string }[] {
  const h2 = /<h2>[^<]*frequently asked questions[^<]*<\/h2>/i.exec(main);
  let region = main;
  if (h2 !== null) {
    const after = main.slice(h2.index + h2[0].length);
    const next = after.search(/<h2\b/);
    region = next === -1 ? after : after.slice(0, next);
  }
  return [
    ...region.matchAll(/<h3>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h[1-6]\b|$)/g),
  ].map((m) => ({ q: inlineText(m[1] ?? ""), a: inlineText(m[2] ?? "") }));
}

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
        expect(faqs.length).toBeLessThanOrEqual(1);
        const faq = faqs[0];
        if (faq === undefined) return;
        const entities = faq["mainEntity"] as Ld[];
        expect(entities.length).toBeGreaterThan(0);
        const ld = entities.map((q) => {
          // wrong @type on either level must fail, not just a missing name
          expect(q["@type"]).toBe("Question");
          const answer = q["acceptedAnswer"] as Ld;
          expect(answer["@type"]).toBe("Answer");
          return {
            q: String(q["name"]),
            a: String(answer["text"]).replace(/\s+/g, " ").trim(),
          };
        });
        // compare pair by pair, in order and in both directions, so swapped
        // answers, missing entries and visible-only questions all fail
        expect(visibleFaq(mainOf(html))).toEqual(ld);
      });

      it("shows a last-updated date that matches dateModified in words", () => {
        const modified = /"dateModified": "(\d{4}-\d{2}-\d{2})"/.exec(
          html,
        )?.[1];
        // the /guide/ index carries no date at all
        if (modified === undefined) {
          expect(html).not.toContain('class="last-updated"');
          return;
        }
        const human = new Date(`${modified}T12:00:00Z`).toLocaleDateString(
          "en-US",
          { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" },
        );
        expect(html).toContain(
          `<p class="last-updated">Last updated <time datetime="${modified}">${human}</time></p>`,
        );
      });

      it("never skips a heading level", () => {
        const levels = [...mainOf(html).matchAll(/<h([1-6])\b/g)].map((m) =>
          Number(m[1]),
        );
        expect(levels[0]).toBe(1);
        for (let i = 1; i < levels.length; i++) {
          const prev = levels[i - 1] ?? 1;
          const cur = levels[i] ?? 1;
          expect(
            cur,
            `h${prev} -> h${cur} at heading ${i + 1}`,
          ).toBeLessThanOrEqual(prev + 1);
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

  for (const { path: p, html, title } of pages) {
    it(`${p} avoids claims we can't stand behind`, () => {
      let text = plain(
        `${title} ${mainOf(html)} ${meta(html, "name", "description").join(" ")}`,
      );
      for (const { page, phrase } of ALLOWED) {
        if (page !== p) continue;
        expect(text, `stale allowlist: ${phrase}`).toContain(phrase);
        text = text.split(phrase).join(" ");
      }
      for (const [term, re] of Object.entries(FORBIDDEN)) {
        const hit = re.exec(text);
        const context =
          hit === null
            ? ""
            : text.slice(Math.max(0, hit.index - 50), hit.index + 50);
        expect(hit, `${term}: …${context}…`).toBeNull();
      }
    });
  }
});
