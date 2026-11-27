import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { themes } from "../src/ts/constants/themes";
import { AA, contrast } from "../src/ts/multiplayer/self-highlight";

const srcDir = path.resolve(__dirname, "../src");
const intro = readFileSync(path.join(srcDir, "html/site-intro.html"), "utf-8");
const css = /<style>([\s\S]*?)<\/style>/.exec(intro)?.[1] ?? "";

/** declarations of one css rule, by its exact selector */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (m === null) throw new Error(`no rule ${selector}`);
  return m[1] as string;
}

/** index.html with html partials inlined, as the build serves it */
function serverHtml(): string {
  const inline = (html: string): string =>
    html.replace(/<load src="([^"]+)" \/>/g, (_, src: string) =>
      inline(readFileSync(path.join(srcDir, src), "utf-8")),
    );
  return inline(readFileSync(path.join(srcDir, "index.html"), "utf-8"));
}

describe("homepage intro (html/site-intro.html)", () => {
  it("reads as body text, not a tiny sub-colour footnote", () => {
    const body = rule("#siteIntro");
    expect(body).toMatch(/font-size:\s*1rem/);
    expect(body).toMatch(/color:\s*var\(--text-color\)/);
    expect(body).toMatch(/line-height:\s*1\.[5-9]/);
    expect(body).toMatch(/max-width:/);
    expect(css).not.toMatch(/font-size:\s*0\.\d+rem/);
    expect(css).not.toMatch(/color:\s*var\(--sub-color\)/);
  });

  it("is never hidden or parked off-screen", () => {
    expect(css).not.toMatch(/position:\s*(absolute|fixed)/);
    expect(css).not.toMatch(/display:\s*none/);
    expect(css).not.toMatch(/visibility:\s*hidden/);
    expect(css).not.toMatch(/opacity:\s*0/);
    expect(css).not.toMatch(/(left|top|text-indent):\s*-/);
    expect(css).not.toMatch(/clip/);
  });

  it("styles headings and underlined, visible links", () => {
    expect(rule("#siteIntro h1")).toMatch(/font-size:\s*1\.5rem/);
    expect(rule("#siteIntro h2")).toMatch(/font-size:\s*1\.125rem/);
    const link = rule("#siteIntro a");
    expect(link).toMatch(/text-decoration:\s*underline/);
    expect(link).toMatch(/color:\s*var\(--main-color\)/);
  });

  it.each(["puggie_dark", "puggie_light"] as const)(
    "%s: body text and links reach WCAG AA on the background",
    (name) => {
      const t = themes[name];
      expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.main, t.bg)).toBeGreaterThanOrEqual(AA);
    },
  );

  it("is in the server html of / with exactly one h1 there", () => {
    const html = serverHtml();
    expect(html).toContain('<section id="siteIntro"');
    expect(html).toContain("A free minimalist typing test</h1>");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });
});
