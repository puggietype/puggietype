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

function renderFile(file: string): string {
  const html = marked.parse(readFileSync(file, "utf-8"), { async: false });
  if (typeof html !== "string") throw new Error(`could not render ${file}`);
  return anchorHeadings(html);
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
