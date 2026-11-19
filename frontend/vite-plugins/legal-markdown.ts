import { Plugin } from "vite";
import path from "node:path";
import { readFileSync } from "node:fs";
import { marked } from "marked";

import { EMAIL_OFF, EMAIL_ON } from "./email-off";

const MARKER = /<!-- legal-markdown:([a-z-]+) -->/g;

function renderFile(file: string): string {
  const html = marked.parse(readFileSync(file, "utf-8"), { async: false });
  if (typeof html !== "string") throw new Error(`could not render ${file}`);
  return html;
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
