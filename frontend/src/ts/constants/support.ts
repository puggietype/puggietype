/**
 * "Support PuggieType" tip links: Ko-fi and GitHub Sponsors, each behind its
 * own build flag (VITE_FEATURE_KOFI, VITE_FEATURE_GITHUB_SPONSORS), off by
 * default. Never on Steam and never on the kids guides.
 *
 * Deviations from the Nov 3 memo (Legal, Nov 9):
 * - "support" / "tip" only, never "donate" / "donation" in the UI;
 * - no "free and always will be" / "stays free for everyone" promise
 *   (conflicts with the planned Steam supporter pack);
 * - "aren't tax-deductible as charitable donations" is the Nov 9 wording;
 * - no emojis (no ☕, 🐶 or 💛);
 * - GitHub Sponsors is a second, separately flagged link;
 * - the footer links to /guide/about#support, not straight to Ko-fi, so the
 *   disclaimer always sits next to the ask.
 *
 * Shared by the SPA (Footer, AboutPage) and vite-plugins/support-links.ts,
 * which applies the same rules to the static pages. Keep it free of DOM code.
 */

export const SUPPORT_HEADING = "Support PuggieType";
export const SUPPORT_FOOTER_LABEL = "Support PuggieType";
export const SUPPORT_FOOTER_HREF = "/guide/about#support";
export const SUPPORT_EMAIL = "support@puggietype.com";

export type TipPlatform = "kofi" | "githubSponsors";

export type TipLink = {
  platform: TipPlatform;
  name: string;
  label: string;
  href: string;
};

export const TIP_LINKS: Record<TipPlatform, TipLink> = {
  kofi: {
    platform: "kofi",
    name: "Ko-fi",
    label: "Leave a tip on Ko-fi",
    href: "https://ko-fi.com/puggietype",
  },
  githubSponsors: {
    platform: "githubSponsors",
    name: "GitHub Sponsors",
    label: "Leave a tip on GitHub Sponsors",
    href: "https://github.com/sponsors/puggietype",
  },
};

const INTRO_START =
  "PuggieType is a free typing test, made by a small team in our spare time. If you enjoy it and want to help keep it running, you can leave an optional tip on";

export const SUPPORT_DISCLAIMER_BEFORE_EMAIL =
  "Tips are voluntary gifts to the PuggieType team. PuggieType is not a charity or nonprofit, and tips aren't tax-deductible as charitable donations. Tips don't unlock any features, perks or rewards. Tips go to the PuggieType team only, not to the Monkeytype project. Please ask a parent or guardian before tipping if you're under 18. Questions or a mistaken tip? Email";

export const SUPPORT_DISCLAIMER = `${SUPPORT_DISCLAIMER_BEFORE_EMAIL} ${SUPPORT_EMAIL}.`;

/** the intro sentence for the links shown, e.g. "... on Ko-fi or GitHub Sponsors." */
export function supportIntro(links: readonly TipLink[]): string {
  return `${INTRO_START} ${links.map((l) => l.name).join(" or ")}.`;
}

/** the kids guides: no tip or support links, ever */
export const KIDS_SLUGS: readonly string[] = [
  "teaching-kids-to-type",
  "typing-for-kids",
];

/**
 * true for /guide/<kids slug> (with or without a trailing slash) and for the
 * kids HTML entries (typing-for-kids.html, also as a full file path)
 */
export function isKidsPath(pathOrFile: string): boolean {
  const last = pathOrFile
    .replaceAll("\\", "/")
    .replace(/\/+$/, "")
    .split("/")
    .pop();
  return KIDS_SLUGS.includes((last ?? "").replace(/\.html$/, "").toLowerCase());
}

export type SupportContext = {
  kofi: boolean;
  githubSponsors: boolean;
  platform: "web" | "steam";
  /** pathname, or the HTML entry file name */
  path: string;
};

/** links to show, Ko-fi first; empty on Steam, kids pages or with flags off */
export function visibleTipLinks(ctx: SupportContext): TipLink[] {
  if (ctx.platform === "steam" || isKidsPath(ctx.path)) return [];
  const links: TipLink[] = [];
  if (ctx.kofi) links.push(TIP_LINKS.kofi);
  if (ctx.githubSponsors) links.push(TIP_LINKS.githubSponsors);
  return links;
}

/** the quiet footer link shows whenever the About section has a link */
export function showSupportFooterLink(ctx: SupportContext): boolean {
  return visibleTipLinks(ctx).length > 0;
}

/** build-time flags and platform of this bundle (tests stub the globals) */
export function getSupportContext(path: string): SupportContext {
  return {
    // === true: only the boolean define, not a stubbed "true" or 1
    // oxlint-disable-next-line typescript/no-unnecessary-boolean-literal-compare
    kofi: typeof __FEATURE_KOFI__ !== "undefined" && __FEATURE_KOFI__ === true,
    githubSponsors:
      typeof __FEATURE_GITHUB_SPONSORS__ !== "undefined" &&
      // oxlint-disable-next-line typescript/no-unnecessary-boolean-literal-compare
      __FEATURE_GITHUB_SPONSORS__ === true,
    platform:
      typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam"
        ? "steam"
        : "web",
    path,
  };
}
