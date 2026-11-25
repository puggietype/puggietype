import { Plugin } from "vite";

import {
  supportIntro,
  visibleTipLinks,
  type SupportContext,
  type TipPlatform,
} from "../src/ts/constants/support";
import type { BuildPlatform } from "./platform";

/** VITE_FEATURE_KOFI: on only for the literal "true" */
export function isKofiEnabled(env: Record<string, string>): boolean {
  return env["VITE_FEATURE_KOFI"] === "true";
}

/** VITE_FEATURE_GITHUB_SPONSORS: on only for the literal "true" */
export function isGithubSponsorsEnabled(env: Record<string, string>): boolean {
  return env["VITE_FEATURE_GITHUB_SPONSORS"] === "true";
}

export type SupportLinksOptions = {
  kofi: boolean;
  githubSponsors: boolean;
  platform: BuildPlatform;
};

/** `<!-- name:start -->...<!-- name:end -->`, plus the whitespace before it */
function block(name: string): RegExp {
  return new RegExp(
    `[ \\t]*<!-- ${name}:start -->[\\s\\S]*?<!-- ${name}:end -->[ \\t]*\\n?`,
    "g",
  );
}

/** keeps a block's content, drops only its marker comments */
function unwrap(html: string, name: string): string {
  return html.replace(
    new RegExp(`[ \\t]*<!-- ${name}:(?:start|end) -->[ \\t]*\\n?`, "g"),
    "",
  );
}

const LINK_BLOCK: Record<TipPlatform, string> = {
  kofi: "support-kofi",
  githubSponsors: "support-github-sponsors",
};

/**
 * Static pages: the footer link (support-footer block in footer.html) and the
 * About section (support-section block in guide/about.html) stay only when a
 * tip link is visible for this page (see constants/support.ts). The intro
 * sentence (support-intro block) is rewritten to name only the shown links.
 */
export function transformSupportHtml(
  html: string,
  filename: string,
  options: SupportLinksOptions,
): string {
  const ctx: SupportContext = { ...options, path: filename };
  const links = visibleTipLinks(ctx);
  if (links.length === 0) {
    return html
      .replace(block("support-footer"), "")
      .replace(block("support-section"), "");
  }
  let out = html;
  for (const [platform, name] of Object.entries(LINK_BLOCK)) {
    out = links.some((l) => l.platform === platform)
      ? unwrap(out, name)
      : out.replace(block(name), "");
  }
  out = out.replace(
    /(<!-- support-intro:start -->)[\s\S]*?(<!-- support-intro:end -->)/g,
    `$1${supportIntro(links)}$2`,
  );
  for (const name of ["support-footer", "support-section", "support-intro"]) {
    out = unwrap(out, name);
  }
  return out;
}

/** Applies the Ko-fi / GitHub Sponsors flags to the static pages. */
export function supportLinks(options: SupportLinksOptions): Plugin {
  return {
    name: "support-links",
    transformIndexHtml: {
      // default order (after html-inject, which is order: "pre")
      handler(html, ctx) {
        return transformSupportHtml(html, ctx.filename, options);
      },
    },
  };
}
