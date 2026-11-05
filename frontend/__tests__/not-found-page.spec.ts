import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { notFoundPage, toNotFoundHtml } from "../vite-plugins/not-found-page";

type Hooks = {
  configResolved: (c: unknown) => void;
  closeBundle: () => void;
};

describe("not-found-page plugin", () => {
  it("copies the final index.html to 404.html", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nf-"));
    writeFileSync(path.join(dir, "index.html"), "<!doctype html>app");
    const p = notFoundPage() as unknown as Hooks;
    p.configResolved({ root: dir, build: { outDir: "." } });
    p.closeBundle();
    expect(readFileSync(path.join(dir, "404.html"), "utf8")).toBe(
      '<meta name="robots" content="noindex"><!doctype html>app',
    );
  });

  it("404.html drops the canonical and adds robots noindex", () => {
    const out = toNotFoundHtml(
      '<!doctype html><html><head><meta charset="UTF-8"><link rel="canonical" href="https://puggietype.com/"><title>x</title></head><body></body></html>',
    );
    expect(out).not.toMatch(/canonical/i);
    expect(out).toContain(
      '<head><meta name="robots" content="noindex"><meta charset="UTF-8">',
    );
    expect(out.match(/name="robots"/g)).toHaveLength(1);
    expect(toNotFoundHtml(out)).toBe(out);
  });

  it("_redirects: 301s come before the rewrites, slashless targets", () => {
    const lines = readFileSync(
      path.join(__dirname, "../static/_redirects"),
      "utf8",
    )
      .split("\n")
      .filter((l) => l.trim() !== "" && !l.startsWith("#"));
    const firstRewrite = lines.findIndex((l) => l.endsWith(" 200"));
    const want = [
      "/guide /guide/ 301",
      "/about /guide/about 301",
      "/guide/typing-for-kids /guide/teaching-kids-to-type 301",
      "/leaderboard /leaderboards 301",
      "/race/ /race 301",
      "/settings/ /settings 301",
      "/profile/ /profile 301",
    ];
    for (const w of want) {
      const i = lines.indexOf(w);
      expect(i, w).toBeGreaterThanOrEqual(0);
      expect(i, w).toBeLessThan(firstRewrite);
    }
    for (const l of lines.filter((x) => x.endsWith(" 200"))) {
      const from = l.split(" ")[0] as string;
      if (from.endsWith("/*")) continue;
      expect(lines, from).toContain(`${from}/ ${from} 301`);
    }
  });

  it("does nothing without index.html", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nf-"));
    const p = notFoundPage() as unknown as Hooks;
    p.configResolved({ root: dir, build: { outDir: "." } });
    p.closeBundle();
    expect(existsSync(path.join(dir, "404.html"))).toBe(false);
  });

  it("_redirects rewrites every router path (SPA fallback is off)", () => {
    const redirects = readFileSync(
      path.join(__dirname, "../static/_redirects"),
      "utf8",
    );
    const router = readFileSync(
      path.join(__dirname, "../src/ts/controllers/route-controller.ts"),
      "utf8",
    );
    const paths = [...router.matchAll(/path: "(\/[^"]*)"/g)]
      .map((m) => (m[1] as string).replace(/\/:[^/]+/g, "/*"))
      .filter((p) => p !== "/");
    expect(paths.length).toBeGreaterThan(5);
    // /about is a real static page, not an SPA rewrite
    const static301 = new Map([["/about", "/guide/about"]]);
    for (const p of paths) {
      const to = static301.get(p);
      if (to !== undefined) {
        expect(redirects).toMatch(new RegExp(`^${p} ${to} 301$`, "m"));
        expect(redirects).not.toMatch(new RegExp(`^${p} / 200$`, "m"));
        continue;
      }
      expect(redirects).toMatch(
        new RegExp(`^${p.replace("*", "\\*")} / 200$`, "m"),
      );
    }
  });
});
