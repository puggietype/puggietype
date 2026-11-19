import { Plugin } from "vite";
import path from "node:path";
import { readFileSync } from "node:fs";
import { marked } from "marked";

import { EMAIL_OFF, EMAIL_ON } from "./email-off";

const MARKER = /<!-- legal-markdown:([a-z-]+) -->/g;

/**
 * Wraps every rendered table in the focusable `.tableWrap` scroll region (see
 * static-page.scss) so wide tables scroll sideways on narrow screens instead of
 * running off the page. The region is labelled after the heading above it.
 */
export function wrapTables(html: string): string {
  let lastHeading = "";
  return html.replace(
    /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>|<table>[\s\S]*?<\/table>/g,
    (match: string, heading?: string) => {
      if (heading !== undefined) {
        lastHeading = heading.replace(/<[^>]*>/g, "").trim();
        return match;
      }
      const label = lastHeading ? `table: ${lastHeading}` : "table: scrollable";
      return `<div class="tableWrap" tabindex="0" role="region" aria-label="${label}">${match}</div>`;
    },
  );
}

function renderFile(file: string): string {
  const html = marked.parse(readFileSync(file, "utf-8"), { async: false });
  if (typeof html !== "string") throw new Error(`could not render ${file}`);
  return wrapTables(html);
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
