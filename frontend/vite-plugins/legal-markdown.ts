import { Plugin } from "vite";
import path from "node:path";
import { readFileSync } from "node:fs";
import { marked } from "marked";

import { EMAIL_OFF, EMAIL_ON } from "./email-off";

const MARKER = /<!-- legal-markdown:([a-z-]+) -->/g;
const H2 = /<h2>([^<]*)<\/h2>/g;

/** h2s that other pages link to; the rest stay plain so rendered HTML matches marked */
export const ANCHORED_H2S: ReadonlySet<string> = new Set([
  "Accounts (ages 13+)", // FE links to /privacy#accounts-ages-13
]);

/** "Accounts (ages 13+)" -> "accounts-ages-13" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Gives each h2 in `ANCHORED_H2S` an id slugified from its text. */
export function anchorHeadings(html: string): string {
  return html.replace(H2, (h2, text: string) =>
    ANCHORED_H2S.has(text) ? `<h2 id="${slugify(text)}">${text}</h2>` : h2,
  );
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function codePoint(code: number, original: string): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : original;
}

/** Heading html -> plain text (tags dropped, entities decoded). */
function headingText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
      (
        m: string,
        dec: string | undefined,
        hex: string | undefined,
        name: string | undefined,
      ) => {
        if (dec !== undefined) return codePoint(Number(dec), m);
        if (hex !== undefined) return codePoint(parseInt(hex, 16), m);
        return ENTITIES[(name ?? "").toLowerCase()] ?? m;
      },
    )
    .trim();
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Wraps every rendered table in the focusable `.tableWrap` scroll region (see
 * static-page.scss) so wide tables scroll sideways on narrow screens instead of
 * running off the page. The region is labelled after the heading above it;
 * several tables under one heading get " (2)", " (3)" suffixes so each region
 * name is unique.
 */
export function wrapTables(html: string): string {
  let lastHeading = "";
  let tablesUnderHeading = 0;
  return html.replace(
    /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>|<table>[\s\S]*?<\/table>/g,
    (match: string, heading?: string) => {
      if (heading !== undefined) {
        lastHeading = headingText(heading);
        tablesUnderHeading = 0;
        return match;
      }
      tablesUnderHeading++;
      const base = lastHeading ? `table: ${lastHeading}` : "table: scrollable";
      const name =
        tablesUnderHeading > 1 ? `${base} (${tablesUnderHeading})` : base;
      return `<div class="tableWrap" tabindex="0" role="region" aria-label="${escapeAttr(name)}">${match}</div>`;
    },
  );
}

function renderFile(file: string): string {
  const html = marked.parse(readFileSync(file, "utf-8"), { async: false });
  if (typeof html !== "string") throw new Error(`could not render ${file}`);
  return wrapTables(anchorHeadings(html));
}

/**
 * Replaces `<!-- legal-markdown:<name> -->` with `<dir>/<name>.md` rendered
 * verbatim, inside email_off (the legal text has plain email addresses).
 */
export function renderLegalMarkdown(html: string, dir: string): string {
  return html.replace(
    MARKER,
    (_, name: string) =>
      `${EMAIL_OFF}${renderFile(path.join(dir, `${name}.md`))}${EMAIL_ON}`,
  );
}

export function legalMarkdown(options: { dir: string }): Plugin {
  return {
    name: "legal-markdown",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => renderLegalMarkdown(html, options.dir),
    },
    configureServer(server) {
      server.watcher.add(options.dir);
    },
  };
}
