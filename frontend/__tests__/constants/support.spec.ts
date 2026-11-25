import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSupportContext,
  isKidsPath,
  showSupportFooterLink,
  SUPPORT_DISCLAIMER,
  SUPPORT_FOOTER_HREF,
  SUPPORT_FOOTER_LABEL,
  SUPPORT_HEADING,
  supportIntro,
  TIP_LINKS,
  visibleTipLinks,
  type SupportContext,
} from "../../src/ts/constants/support";
import { KIDS_HTML } from "../../vite-plugins/static-consent-script";
import {
  isGithubSponsorsEnabled,
  isKofiEnabled,
} from "../../vite-plugins/support-links";

afterEach(() => {
  vi.unstubAllGlobals();
});

const KIDS = [
  "/guide/teaching-kids-to-type",
  "/guide/teaching-kids-to-type/",
  "/guide/typing-for-kids",
  "/guide/typing-for-kids/",
  "typing-for-kids.html",
  "teaching-kids-to-type.html",
  "/abs/frontend/src/guide/typing-for-kids.html",
  "C:\\src\\guide\\teaching-kids-to-type.html",
];
const NOT_KIDS = [
  "/",
  "/guide/about",
  "/guide/about/",
  "/guide/",
  "/faq",
  "/about",
  "about.html",
  "/abs/frontend/src/guide/about.html",
  "/abs/frontend/src/html/static-page/footer.html",
];

const ctx = (over: Partial<SupportContext>): SupportContext => ({
  kofi: false,
  githubSponsors: false,
  platform: "web",
  path: "/guide/about",
  ...over,
});

describe("support flags (build env)", () => {
  it("Ko-fi is on only for the exact string 'true'", () => {
    expect(isKofiEnabled({})).toBe(false);
    for (const value of [
      "",
      "false",
      "0",
      "1",
      "TRUE",
      "True",
      " true",
      "yes",
    ]) {
      expect(isKofiEnabled({ VITE_FEATURE_KOFI: value }), value).toBe(false);
    }
    expect(isKofiEnabled({ VITE_FEATURE_KOFI: "true" })).toBe(true);
    expect(isKofiEnabled({ VITE_FEATURE_GITHUB_SPONSORS: "true" })).toBe(false);
  });

  it("GitHub Sponsors is on only for the exact string 'true'", () => {
    expect(isGithubSponsorsEnabled({})).toBe(false);
    for (const value of [
      "",
      "false",
      "0",
      "1",
      "TRUE",
      "True",
      " true",
      "yes",
    ]) {
      expect(
        isGithubSponsorsEnabled({ VITE_FEATURE_GITHUB_SPONSORS: value }),
        value,
      ).toBe(false);
    }
    expect(
      isGithubSponsorsEnabled({ VITE_FEATURE_GITHUB_SPONSORS: "true" }),
    ).toBe(true);
    expect(isGithubSponsorsEnabled({ VITE_FEATURE_KOFI: "true" })).toBe(false);
  });

  it("off by default in tests (the defines are unset)", () => {
    const g = globalThis as {
      __FEATURE_KOFI__?: boolean;
      __FEATURE_GITHUB_SPONSORS__?: boolean;
    };
    expect(g.__FEATURE_KOFI__).toBeFalsy();
    expect(g.__FEATURE_GITHUB_SPONSORS__).toBeFalsy();
    const c = getSupportContext("/guide/about");
    expect(c).toEqual(ctx({}));
    expect(visibleTipLinks(c)).toEqual([]);
    expect(showSupportFooterLink(c)).toBe(false);
  });

  it("reads the stubbed defines and the steam platform", () => {
    vi.stubGlobal("__FEATURE_KOFI__", true);
    expect(getSupportContext("/x")).toEqual(ctx({ kofi: true, path: "/x" }));
    vi.stubGlobal("__FEATURE_GITHUB_SPONSORS__", true);
    vi.stubGlobal("__PLATFORM__", "steam");
    expect(getSupportContext("/x")).toEqual(
      ctx({ kofi: true, githubSponsors: true, platform: "steam", path: "/x" }),
    );
  });

  it("only a literal true counts", () => {
    vi.stubGlobal("__FEATURE_KOFI__", "true");
    vi.stubGlobal("__FEATURE_GITHUB_SPONSORS__", 1);
    const c = getSupportContext("/");
    expect(c.kofi).toBe(false);
    expect(c.githubSponsors).toBe(false);
  });
});

describe("isKidsPath", () => {
  it("matches the kids guides and their HTML entries", () => {
    for (const p of KIDS) expect(isKidsPath(p), p).toBe(true);
  });

  it("does not match other pages", () => {
    for (const p of NOT_KIDS) expect(isKidsPath(p), p).toBe(false);
  });

  it("covers the same HTML entries as static-consent-script", () => {
    for (const file of KIDS_HTML) expect(isKidsPath(file), file).toBe(true);
    expect(KIDS_HTML).toHaveLength(2);
  });

  it("matches kids slugs case-insensitively", () => {
    expect(isKidsPath("/guide/Teaching-Kids-To-Type")).toBe(true);
    expect(isKidsPath("/guide/TYPING-FOR-KIDS/")).toBe(true);
    expect(isKidsPath("guide/Typing-For-Kids.html")).toBe(true);
    expect(isKidsPath("/GUIDE/about")).toBe(false);
  });
});

describe("visibility", () => {
  const platforms = ["web", "steam"] as const;
  const paths = [...KIDS, ...NOT_KIDS];

  for (const kofi of [false, true]) {
    for (const githubSponsors of [false, true]) {
      for (const platform of platforms) {
        it(`kofi=${kofi} sponsors=${githubSponsors} ${platform}`, () => {
          for (const path of paths) {
            const c = ctx({ kofi, githubSponsors, platform, path });
            const shown =
              platform === "web" && !isKidsPath(path)
                ? [
                    ...(kofi ? [TIP_LINKS.kofi] : []),
                    ...(githubSponsors ? [TIP_LINKS.githubSponsors] : []),
                  ]
                : [];
            expect(visibleTipLinks(c), path).toEqual(shown);
            expect(showSupportFooterLink(c), path).toBe(shown.length > 0);
          }
        });
      }
    }
  }

  it("flags off: nothing, anywhere", () => {
    for (const platform of platforms) {
      for (const path of paths) {
        const c = ctx({ platform, path });
        expect(visibleTipLinks(c)).toEqual([]);
        expect(showSupportFooterLink(c)).toBe(false);
      }
    }
  });

  it("steam: nothing even with both flags on", () => {
    const c = ctx({ kofi: true, githubSponsors: true, platform: "steam" });
    expect(visibleTipLinks(c)).toEqual([]);
    expect(showSupportFooterLink(c)).toBe(false);
  });
});

describe("support copy", () => {
  const START =
    "PuggieType is a free typing test, made by a small team in our spare time. If you enjoy it and want to help keep it running, you can leave an optional tip on";

  it("intro names only the links shown", () => {
    expect(supportIntro([TIP_LINKS.kofi])).toBe(`${START} Ko-fi.`);
    expect(supportIntro([TIP_LINKS.githubSponsors])).toBe(
      `${START} GitHub Sponsors.`,
    );
    expect(supportIntro([TIP_LINKS.kofi, TIP_LINKS.githubSponsors])).toBe(
      `${START} Ko-fi or GitHub Sponsors.`,
    );
  });

  it("links, heading, footer and disclaimer use Legal's exact wording", () => {
    expect(TIP_LINKS.kofi.label).toBe("Leave a tip on Ko-fi");
    expect(TIP_LINKS.kofi.href).toBe("https://ko-fi.com/puggietype");
    expect(TIP_LINKS.githubSponsors.label).toBe(
      "Leave a tip on GitHub Sponsors",
    );
    expect(TIP_LINKS.githubSponsors.href).toBe(
      "https://github.com/sponsors/puggietype",
    );
    expect(SUPPORT_HEADING).toBe("Support PuggieType");
    expect(SUPPORT_FOOTER_LABEL).toBe("Support PuggieType");
    expect(SUPPORT_FOOTER_HREF).toBe("/guide/about#support");
    expect(SUPPORT_DISCLAIMER).toBe(
      "Tips are voluntary gifts to the PuggieType team. PuggieType is not a charity or nonprofit, and tips aren't tax-deductible as charitable donations. Tips don't unlock any features, perks or rewards. Tips go to the PuggieType team only, not to the Monkeytype project. Please ask a parent or guardian before tipping if you're under 18. Questions or a mistaken tip? Email support@puggietype.com.",
    );
  });

  it("no 'donate', no free-forever promise, no emojis", () => {
    const ui = [
      supportIntro([TIP_LINKS.kofi, TIP_LINKS.githubSponsors]),
      TIP_LINKS.kofi.label,
      TIP_LINKS.githubSponsors.label,
      SUPPORT_HEADING,
      SUPPORT_FOOTER_LABEL,
      SUPPORT_DISCLAIMER,
    ].join("\n");
    expect(ui).not.toMatch(/\bdonate\b|\bdonation\b/i);
    expect(ui).not.toMatch(/always will be|stays free/i);
    expect(ui).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
