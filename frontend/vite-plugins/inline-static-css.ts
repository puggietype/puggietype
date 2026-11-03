import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Plugin } from "vite";

const LINK_RE =
  /<link\b[^>]*\brel="?stylesheet"?[^>]*\bhref="?(\/css\/static-page\.[\w-]+\.css)"?[^>]*>/g;

/** replaces the static-page stylesheet link with an inline <style> */
export function inlineStaticCss(
  html: string,
  readCss: (href: string) => string,
): string {
  return html.replace(
    LINK_RE,
    (_, href: string) => `<style>${readCss(href).trim()}</style>`,
  );
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith(".html") ? [p] : [];
  });
}

/**
 * The static pages (guides, faq, legal) have one small stylesheet; inlining it
 * removes their only render-blocking request. CSP allows inline styles.
 */
export function inlineStaticPageCss(): Plugin {
  let outDir = path.resolve("./dist");
  return {
    name: "inline-static-css",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!existsSync(outDir)) return;
      const readCss = (href: string): string =>
        readFileSync(path.join(outDir, href), "utf8");
      for (const file of htmlFiles(outDir)) {
        const html = readFileSync(file, "utf8");
        const out = inlineStaticCss(html, readCss);
        if (out !== html) writeFileSync(file, out);
      }
    },
  };
}
