import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Plugin } from "vite";

import {
  SUPPORT_LINKS,
  type SupportLinkConfig,
  supportLinksEnabled,
} from "../src/ts/constants/support";

function footerPath(): string {
  const candidates = [
    path.resolve("src/html/static-page/footer.html"),
    path.resolve("frontend/src/html/static-page/footer.html"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(`support footer partial not found (cwd ${process.cwd()})`);
  }
  return found;
}

const FOOTER_LOAD = /<load\s+src="html\/static-page\/footer\.html"\s*\/>/g;

const SUPPORT_BLOCK =
  /[ \t]*<!-- support-links:start -->[\s\S]*?<!-- support-links:end -->\n?/g;

const KIDS_PAGE = "guide/typing-for-kids.html";

const KIDS_FORBIDDEN = [
  "__KOFI_URL__",
  "__SPONSORS_URL__",
  "ko-fi.com",
  "github.com/sponsors",
  "Support PuggieType",
];

export function isTypingForKidsPage(filename: string): boolean {
  return filename.replaceAll("\\", "/").endsWith(KIDS_PAGE);
}

/**
 * Fills `__KOFI_URL__` and `__SPONSORS_URL__` from `SUPPORT_LINKS` when both
 * are non-empty. Otherwise every support block is removed. The kids guide
 * never keeps a block. Inlines the shared footer if html-inject has not run.
 */
export function applySupportHtml(
  html: string,
  filename: string,
  links: SupportLinkConfig = SUPPORT_LINKS,
): string {
  const footer = readFileSync(footerPath(), "utf8");
  let next = html.replace(FOOTER_LOAD, () => footer);
  const enabled = supportLinksEnabled(links);

  if (!enabled || isTypingForKidsPage(filename)) {
    next = next.replace(SUPPORT_BLOCK, "");
  }

  if (isTypingForKidsPage(filename)) {
    const leaked = KIDS_FORBIDDEN.filter((token) => next.includes(token));
    if (leaked.length > 0) {
      throw new Error(
        `typing-for-kids must not include support prompts (found ${leaked.join(", ")})`,
      );
    }
    return next;
  }

  if (!enabled) {
    if (next.includes("__KOFI_URL__") || next.includes("__SPONSORS_URL__")) {
      throw new Error(
        "support URL tokens left in a page while tip links are unset",
      );
    }
    return next;
  }

  return next
    .replaceAll("__KOFI_URL__", links.KOFI_URL)
    .replaceAll("__SPONSORS_URL__", links.SPONSORS_URL);
}

export function supportLinks(): Plugin {
  return {
    name: "support-links",
    transformIndexHtml: {
      handler(html, ctx) {
        return applySupportHtml(html, ctx.filename);
      },
    },
  };
}
