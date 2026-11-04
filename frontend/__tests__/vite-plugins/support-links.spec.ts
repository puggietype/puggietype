import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  SUPPORT_LINKS,
  supportLinksEnabled,
} from "../../src/ts/constants/support";
import {
  applySupportHtml,
  isTypingForKidsPage,
} from "../../vite-plugins/support-links";

const guideDir = path.resolve(__dirname, "../../src/guide");
const footerPath = path.resolve(
  __dirname,
  "../../src/html/static-page/footer.html",
);

const kidsFile = path.join(guideDir, "typing-for-kids.html");
const aboutFile = path.join(guideDir, "about.html");

const configured = {
  KOFI_URL: "https://ko-fi.com/puggietype",
  SPONSORS_URL: "https://github.com/sponsors/puggietype",
};

describe("SUPPORT_LINKS", () => {
  it("defaults both URLs to empty so nothing is shown", () => {
    expect(Object.keys(SUPPORT_LINKS)).toEqual(["KOFI_URL", "SPONSORS_URL"]);
    expect(SUPPORT_LINKS.KOFI_URL).toBe("");
    expect(SUPPORT_LINKS.SPONSORS_URL).toBe("");
    expect(supportLinksEnabled()).toBe(false);
    expect(
      supportLinksEnabled({
        KOFI_URL: "https://ko-fi.com/puggietype",
        SPONSORS_URL: "  ",
      }),
    ).toBe(false);
    expect(
      supportLinksEnabled({
        KOFI_URL: "",
        SPONSORS_URL: "https://github.com/sponsors/puggietype",
      }),
    ).toBe(false);
    expect(supportLinksEnabled(configured)).toBe(true);
    expect(configured.KOFI_URL).not.toMatch(/[?#]/);
    expect(configured.SPONSORS_URL).not.toMatch(/[?#]/);
  });
});

describe("applySupportHtml", () => {
  it("recognises the kids guide by filename", () => {
    expect(isTypingForKidsPage(kidsFile)).toBe(true);
    expect(isTypingForKidsPage(aboutFile)).toBe(false);
    expect(isTypingForKidsPage("guide/typing-for-kids.html")).toBe(true);
  });

  it("removes the about section and the footer while the URLs are empty", () => {
    const out = applySupportHtml(readFileSync(aboutFile, "utf8"), aboutFile);
    expect(out).not.toContain("Support PuggieType");
    expect(out).not.toContain("Tip options");
    expect(out).not.toContain("ko-fi");
    expect(out).not.toContain("github.com/sponsors");
    expect(out).not.toContain("__KOFI_URL__");
    expect(out).not.toContain("__SPONSORS_URL__");
    expect(out).not.toContain("support-links:");
    expect(out).toContain("Who runs it");
    expect(out).toContain('href="/contact"');
  });

  it("removes an already inlined footer while the URLs are empty", () => {
    const footer = readFileSync(footerPath, "utf8");
    const out = applySupportHtml(`<main></main>\n${footer}`, "contact.html");
    expect(out).not.toContain("supportLinks");
    expect(out).not.toContain("__KOFI_URL__");
    expect(out).toContain("comes with no warranty");
  });

  it("hides the blocks when only one URL is set", () => {
    const out = applySupportHtml(readFileSync(aboutFile, "utf8"), aboutFile, {
      KOFI_URL: configured.KOFI_URL,
      SPONSORS_URL: "",
    });
    expect(out).not.toContain("ko-fi.com");
    expect(out).not.toContain("__SPONSORS_URL__");
    expect(out).not.toContain("Support PuggieType");
  });

  it("puts Ko-fi and GitHub Sponsors on the about page and in the footer", () => {
    const out = applySupportHtml(
      readFileSync(aboutFile, "utf8"),
      aboutFile,
      configured,
    );
    expect(out).not.toContain("__KOFI_URL__");
    expect(out).not.toContain("__SPONSORS_URL__");
    expect(out).toContain('id="support"');
    expect(out).toContain('aria-label="Tip options"');
    expect(out).not.toContain('aria-labelledby="support"');
    expect(out).toContain('class="supportButton"');
    expect(out).toContain('aria-label="Support PuggieType"');
    const kofi = out.split(configured.KOFI_URL).length - 1;
    const sponsors = out.split(configured.SPONSORS_URL).length - 1;
    // section plus shared footer
    expect(kofi).toBe(2);
    expect(sponsors).toBe(2);
    expect(out).toContain(
      'aria-label="Support PuggieType on Ko-fi (opens in a new tab)"',
    );
    expect(out).toContain(
      'aria-label="Support PuggieType on GitHub Sponsors (opens in a new tab)"',
    );
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).not.toContain('rel="noreferrer noopener"');
    expect(out).toContain('target="_blank"');
  });

  it("fills tokens when the footer partial is already inlined", () => {
    const footer = readFileSync(footerPath, "utf8");
    const out = applySupportHtml(
      `<main></main>\n${footer}`,
      "contact.html",
      configured,
    );
    expect(out).toContain(configured.KOFI_URL);
    expect(out).toContain(configured.SPONSORS_URL);
    expect(out).not.toContain("__KOFI_URL__");
    expect(out.match(/<nav class="supportLinks"/g)?.length).toBe(1);
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("strips every support prompt from the kids guide", () => {
    const source = readFileSync(kidsFile, "utf8");
    expect(source).not.toContain("ko-fi");
    expect(source).not.toContain("Support PuggieType");
    expect(source).toContain('src="html/static-page/footer.html"');

    for (const links of [SUPPORT_LINKS, configured]) {
      const out = applySupportHtml(source, kidsFile, links);
      expect(out).not.toContain("ko-fi");
      expect(out).not.toContain("github.com/sponsors");
      expect(out).not.toContain("Support PuggieType");
      expect(out).not.toContain("__KOFI_URL__");
      expect(out).not.toContain("__SPONSORS_URL__");
      expect(out).not.toContain("support-links:");
      expect(out).toContain("Typing for kids");
      expect(out).toContain('href="/contact"');
      expect(out).toContain("comes with no warranty");
    }
  });

  it("strips an already inlined footer on the kids guide", () => {
    const footer = readFileSync(footerPath, "utf8");
    const html = readFileSync(kidsFile, "utf8").replace(
      /<load\s+src="html\/static-page\/footer\.html"\s*\/>/,
      footer,
    );
    const out = applySupportHtml(html, kidsFile, configured);
    expect(out).not.toContain("ko-fi.com");
    expect(out).not.toContain("Support PuggieType");
    expect(out).toContain('href="/"');
  });

  it("refuses a kids page that still has a tip link outside the block", () => {
    const html = `<p><a href="https://ko-fi.com/puggietype">tip</a></p>`;
    expect(() => applySupportHtml(html, kidsFile, configured)).toThrow(
      /support prompts/,
    );
  });
});
