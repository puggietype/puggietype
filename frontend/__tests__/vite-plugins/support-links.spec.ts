import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SUPPORT_LINKS } from "../../src/ts/constants/support";
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

describe("SUPPORT_LINKS", () => {
  it("is the only placeholder config, with no tracking params", () => {
    expect(Object.keys(SUPPORT_LINKS)).toEqual(["KOFI_URL", "SPONSORS_URL"]);
    expect(SUPPORT_LINKS.KOFI_URL).toMatch(
      /^https:\/\/ko-fi\.com\/[a-z0-9-]+$/,
    );
    expect(SUPPORT_LINKS.SPONSORS_URL).toMatch(
      /^https:\/\/github\.com\/sponsors\/[a-z0-9-]+$/,
    );
    expect(SUPPORT_LINKS.KOFI_URL).not.toMatch(/[?#]/);
    expect(SUPPORT_LINKS.SPONSORS_URL).not.toMatch(/[?#]/);
  });
});

describe("applySupportHtml", () => {
  it("recognises the kids guide by filename", () => {
    expect(isTypingForKidsPage(kidsFile)).toBe(true);
    expect(isTypingForKidsPage(aboutFile)).toBe(false);
    expect(isTypingForKidsPage("guide/typing-for-kids.html")).toBe(true);
  });

  it("puts Ko-fi and GitHub Sponsors on the about page and in the footer", () => {
    const out = applySupportHtml(readFileSync(aboutFile, "utf8"), aboutFile);
    expect(out).not.toContain("__KOFI_URL__");
    expect(out).not.toContain("__SPONSORS_URL__");
    expect(out).toContain('id="support"');
    expect(out).toContain('aria-labelledby="support"');
    expect(out).toContain('class="supportButton"');
    expect(out).toContain('aria-label="Support PuggieType"');
    const kofi = out.split(SUPPORT_LINKS.KOFI_URL).length - 1;
    const sponsors = out.split(SUPPORT_LINKS.SPONSORS_URL).length - 1;
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
    expect(out).toContain('target="_blank"');
  });

  it("fills tokens when the footer partial is already inlined", () => {
    const footer = readFileSync(footerPath, "utf8");
    const out = applySupportHtml(`<main></main>\n${footer}`, "contact.html");
    expect(out).toContain(SUPPORT_LINKS.KOFI_URL);
    expect(out).toContain(SUPPORT_LINKS.SPONSORS_URL);
    expect(out).not.toContain("__KOFI_URL__");
    expect(out.match(/<nav class="supportLinks"/g)?.length).toBe(1);
  });

  it("strips every support prompt from the kids guide", () => {
    const source = readFileSync(kidsFile, "utf8");
    expect(source).not.toContain("ko-fi");
    expect(source).not.toContain("Support PuggieType");
    expect(source).toContain('src="html/static-page/footer.html"');

    const out = applySupportHtml(source, kidsFile);
    expect(out).not.toContain("ko-fi");
    expect(out).not.toContain("github.com/sponsors");
    expect(out).not.toContain("Support PuggieType");
    expect(out).not.toContain("__KOFI_URL__");
    expect(out).not.toContain("__SPONSORS_URL__");
    expect(out).not.toContain("support-links:");
    expect(out).toContain("Typing for kids");
    expect(out).toContain('href="/contact"');
    expect(out).toContain("comes with no warranty");
  });

  it("strips an already inlined footer on the kids guide", () => {
    const footer = readFileSync(footerPath, "utf8");
    const html = readFileSync(kidsFile, "utf8").replace(
      /<load\s+src="html\/static-page\/footer\.html"\s*\/>/,
      footer,
    );
    const out = applySupportHtml(html, kidsFile);
    expect(out).not.toContain("ko-fi.com");
    expect(out).not.toContain("Support PuggieType");
    expect(out).toContain('href="/"');
  });

  it("refuses a kids page that still has a tip link outside the block", () => {
    const html = `<p><a href="https://ko-fi.com/puggietype">tip</a></p>`;
    expect(() => applySupportHtml(html, kidsFile)).toThrow(/support prompts/);
  });
});
