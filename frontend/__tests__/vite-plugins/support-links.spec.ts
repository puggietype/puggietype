import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  SUPPORT_DISCLAIMER,
  supportIntro,
  TIP_LINKS,
} from "../../src/ts/constants/support";
import {
  supportLinks,
  transformSupportHtml,
  type SupportLinksOptions,
} from "../../vite-plugins/support-links";

const srcDir = path.resolve(__dirname, "../../src");
const read = (rel: string): string =>
  readFileSync(path.join(srcDir, rel), "utf-8");

/** the page as vite-plugin-html-inject hands it over (partials inlined) */
function page(rel: string): string {
  const inline = (html: string): string =>
    html.replace(/<load src="([^"]+)" \/>/g, (_, src: string) =>
      inline(read(src)),
    );
  return inline(read(rel));
}

const ABOUT = path.join(srcDir, "guide/about.html");
const FAQ = path.join(srcDir, "faq.html");
const KIDS = [
  path.join(srcDir, "guide/typing-for-kids.html"),
  path.join(srcDir, "guide/teaching-kids-to-type.html"),
];

const opts = (over: Partial<SupportLinksOptions>): SupportLinksOptions => ({
  kofi: false,
  githubSponsors: false,
  platform: "web",
  ...over,
});
const ALL_ON = [
  opts({ kofi: true }),
  opts({ githubSponsors: true }),
  opts({ kofi: true, githubSponsors: true }),
];

const KOFI = "ko-fi.com";
const SPONSORS = "github.com/sponsors";
const norm = (s: string): string => s.replace(/\s+/g, " ").trim();
const text = (html: string): string =>
  norm(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, ""));

function noSupport(html: string): void {
  expect(html).not.toContain(KOFI);
  expect(html).not.toContain(SPONSORS);
  expect(html).not.toContain("Support PuggieType");
  expect(html).not.toContain("support-footer-link");
  expect(html).not.toContain('id="support"');
  expect(html).not.toMatch(/support-(?:footer|section|intro|kofi|github)/);
  expect(html).not.toMatch(/leave a tip|optional tip|donat/i);
}

function anchors(html: string): { href: string; tag: string }[] {
  return [...html.matchAll(/<a\b[^>]*>/g)].map((m) => ({
    tag: m[0],
    href: /href="([^"]*)"/.exec(m[0])?.[1] ?? "",
  }));
}

describe("support links: source", () => {
  it("raw about.html copy matches constants/support.ts", () => {
    const raw = read("guide/about.html");
    expect(raw).toContain(
      supportIntro([TIP_LINKS.kofi, TIP_LINKS.githubSponsors]),
    );
    expect(raw).toContain(TIP_LINKS.kofi.label);
    expect(raw).toContain(TIP_LINKS.githubSponsors.label);
    expect(text(raw)).toContain(SUPPORT_DISCLAIMER);
    // the email stays inside email_off (cloudflare obfuscation)
    expect(raw).toContain(
      '<!--email_off--><a href="mailto:support@puggietype.com">support@puggietype.com</a><!--/email_off-->',
    );
  });

  it("kids HTML sources never mention support or tip links", () => {
    for (const file of KIDS) {
      const raw = readFileSync(file, "utf-8");
      expect(raw).not.toContain(KOFI);
      expect(raw).not.toContain(SPONSORS);
      expect(raw).not.toContain("Support PuggieType");
      expect(raw).not.toContain("support-section");
    }
  });

  it("the shared footer only has the link inside its markers", () => {
    const raw = read("html/static-page/footer.html");
    const outside = raw.replace(
      /<!-- support-footer:start -->[\s\S]*?<!-- support-footer:end -->/,
      "",
    );
    expect(raw).toContain("Support PuggieType");
    expect(outside).not.toContain("Support PuggieType");
    expect(outside).not.toContain("/guide/about#support");
  });
});

describe("support links: flags off (default)", () => {
  it("strips the footer link and the About section", () => {
    for (const p of ["web", "steam"] as const) {
      const about = transformSupportHtml(page("guide/about.html"), ABOUT, {
        ...opts({}),
        platform: p,
      });
      noSupport(about);
      // the rest of the About page is unchanged
      expect(about).toContain("<h2>Who runs it</h2>");
      expect(about).toContain("<h2>Related guides</h2>");
      expect(about).toContain('"dateModified": "2026-11-23"');
      noSupport(transformSupportHtml(page("faq.html"), FAQ, opts({})));
    }
  });

  it("leaves pages without markers byte for byte", () => {
    const html = "<html><body><p>hi</p></body></html>";
    expect(transformSupportHtml(html, FAQ, opts({}))).toBe(html);
    expect(transformSupportHtml(html, FAQ, opts({ kofi: true }))).toBe(html);
  });
});

describe("support links: steam and kids always strip", () => {
  for (const o of ALL_ON) {
    const name = `kofi=${o.kofi} sponsors=${o.githubSponsors}`;

    it(`steam, ${name}`, () => {
      const steam = { ...o, platform: "steam" as const };
      noSupport(transformSupportHtml(page("guide/about.html"), ABOUT, steam));
      noSupport(transformSupportHtml(page("faq.html"), FAQ, steam));
    });

    it(`kids pages, ${name}`, () => {
      for (const file of KIDS) {
        const out = transformSupportHtml(
          page(path.relative(srcDir, file)),
          file,
          o,
        );
        noSupport(out);
        // the regular footer is still there
        expect(out).toContain('<a href="/creators">Creators</a>');
      }
    });

    it(`kids filename strips even an About-like section, ${name}`, () => {
      for (const file of KIDS) {
        noSupport(transformSupportHtml(page("guide/about.html"), file, o));
        noSupport(
          transformSupportHtml(
            page("guide/about.html"),
            path.basename(file),
            o,
          ),
        );
      }
    });
  }
});

describe("support links: flags on, web", () => {
  function about(o: SupportLinksOptions): string {
    return transformSupportHtml(page("guide/about.html"), ABOUT, o);
  }

  it("keeps the footer link on non-kids pages, internal, same tab", () => {
    for (const o of ALL_ON) {
      for (const [html, file] of [
        [page("faq.html"), FAQ],
        [page("guide/about.html"), ABOUT],
      ] as const) {
        const out = transformSupportHtml(html, file, o);
        const link = anchors(out).filter((a) =>
          a.tag.includes('data-testid="support-footer-link"'),
        );
        expect(link).toHaveLength(1);
        expect(link[0]?.href).toBe("/guide/about#support");
        expect(link[0]?.tag).not.toContain("target=");
        expect(out).toMatch(
          /<a href="\/guide\/about#support" data-testid="support-footer-link">\s*Support PuggieType\s*<\/a>/,
        );
        expect(out).not.toMatch(/<!-- support-[\w-]+:(?:start|end) -->/);
      }
    }
  });

  it("Ko-fi only: no Sponsors URL, Ko-fi-only intro", () => {
    const out = about(opts({ kofi: true }));
    expect(out).toContain('id="support"');
    expect(out).toContain('data-testid="support-section"');
    expect(out).toContain(TIP_LINKS.kofi.href);
    expect(out).toContain(TIP_LINKS.kofi.label);
    expect(out).not.toContain(SPONSORS);
    expect(out).not.toContain("GitHub Sponsors");
    expect(out).toContain(supportIntro([TIP_LINKS.kofi]));
  });

  it("Sponsors only: no Ko-fi URL, Sponsors-only intro", () => {
    const out = about(opts({ githubSponsors: true }));
    expect(out).toContain(TIP_LINKS.githubSponsors.href);
    expect(out).toContain(TIP_LINKS.githubSponsors.label);
    expect(out).not.toContain(KOFI);
    expect(out).not.toContain("Ko-fi");
    expect(out).toContain(supportIntro([TIP_LINKS.githubSponsors]));
  });

  it("both: both links, Ko-fi first, the 'or' intro", () => {
    const out = about(opts({ kofi: true, githubSponsors: true }));
    expect(out.indexOf(TIP_LINKS.kofi.href)).toBeLessThan(
      out.indexOf(TIP_LINKS.githubSponsors.href),
    );
    expect(out).toContain(
      supportIntro([TIP_LINKS.kofi, TIP_LINKS.githubSponsors]),
    );
  });

  it("disclaimer right after the links, every combination", () => {
    for (const o of ALL_ON) {
      const out = about(o);
      const section = /<section id="support"[\s\S]*?<\/section>/.exec(out)?.[0];
      expect(section).toBeDefined();
      expect(section).toMatch(/<\/ul>\s*<p data-testid="support-disclaimer">/);
      expect(text(section ?? "")).toContain(SUPPORT_DISCLAIMER);
      expect(text(section ?? "")).toMatch(/^Support PuggieType /);
    }
  });

  it("external tip links open a new tab with noopener noreferrer", () => {
    for (const o of ALL_ON) {
      const tips = anchors(about(o)).filter(
        (a) => a.href.includes(KOFI) || a.href.includes(SPONSORS),
      );
      expect(tips.length).toBe(Number(o.kofi) + Number(o.githubSponsors));
      for (const a of tips) {
        expect(a.tag).toContain('target="_blank"');
        expect(a.tag).toContain('rel="noopener noreferrer"');
      }
    }
  });

  it("no widgets, scripts, iframes or pixels", () => {
    const out = about(opts({ kofi: true, githubSponsors: true }));
    const section = /<section id="support"[\s\S]*?<\/section>/.exec(out)?.[0];
    expect(section).not.toMatch(/<script|<iframe|<img|<object|<embed/i);
    expect(out).not.toMatch(/<script[^>]*(ko-fi|sponsors)/i);
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(
      /storage\.ko-fi\.com|kofiwidget|ko-fi\.com\/widgets/i,
    );
    expect(out).not.toMatch(/<img[^>]*(ko-fi|sponsors)/i);
  });

  it("leaves the About dates and JSON-LD alone", () => {
    const out = about(opts({ kofi: true, githubSponsors: true }));
    expect(out).toContain('"dateModified": "2026-11-23"');
    expect(out).toContain(
      '"sameAs": ["https://github.com/puggietype/puggietype"]',
    );
    expect(out).toContain("the site is not sponsored by anyone");
  });
});

describe("support links: plugin", () => {
  it("runs after html-inject and passes the entry filename", () => {
    const plugin = supportLinks(opts({ kofi: true }));
    const hook = plugin.transformIndexHtml as {
      order?: string;
      handler: (html: string, ctx: { filename: string }) => string;
    };
    // not "pre": html-inject is already "pre", and this hook needs the inlined footer
    expect(hook.order).not.toBe("pre");
    const html = page("guide/about.html");
    expect(hook.handler(html, { filename: ABOUT })).toContain(KOFI);
    expect(hook.handler(html, { filename: KIDS[0] ?? "" })).not.toContain(KOFI);
  });
});
