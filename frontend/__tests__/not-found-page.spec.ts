import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { notFoundPage } from "../vite-plugins/not-found-page";

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
      "<!doctype html>app",
    );
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
    for (const p of paths) {
      expect(redirects).toMatch(
        new RegExp(`^${p.replace("*", "\\*")} / 200$`, "m"),
      );
    }
  });
});
