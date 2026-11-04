import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// QA PR15-WEB-DEADCODE: the web bundle must not carry the steam funbox
// check. Every call into platform/funbox-availability has to sit behind an
// inline `__PLATFORM__ === "steam"` comparison (no helper function), so vite's
// define folds it away and the module is tree-shaken out of the web build.
const SRC = join(__dirname, "../../src/ts");
const MODULE = "platform/funbox-availability";
const CALLS = /\b(isFunboxAvailable|dropUnavailableFunboxes)\(/g;
const GUARD = 'typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam"';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

const importers = files(SRC).filter(
  (f) =>
    !f.endsWith(`${MODULE}.ts`) && readFileSync(f, "utf8").includes(MODULE),
);

describe("steam funbox checks are inlined at call sites", () => {
  it("has the expected importers", () => {
    expect(importers.map((f) => relative(SRC, f)).sort()).toEqual([
      "commandline/lists/funbox.ts",
      "components/pages/settings/custom-setting/Funbox.tsx",
      "config/metadata.tsx",
      "config/setters.ts",
      "config/utils.ts",
      "controllers/url-handler.tsx",
    ]);
  });

  it.each(importers.map((f) => [relative(SRC, f), f]))(
    "%s guards every call with the inline define",
    (_, file) => {
      const src = readFileSync(file, "utf8");
      const calls = [...src.matchAll(CALLS)];
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        // the guard must come shortly before the call (same expression)
        // (whitespace-insensitive: prettier may wrap the condition)
        const before = src
          .slice(Math.max(0, call.index - 260), call.index)
          .replace(/\s+/g, " ");
        expect(before, `${call[0]} at ${call.index}`).toContain(GUARD);
      }
    },
  );

  it("the module has no isSteamBuild-style helper", () => {
    const src = readFileSync(join(SRC, `${MODULE}.ts`), "utf8");
    expect(src).not.toMatch(/function isSteamBuild/);
    expect(src).not.toMatch(/function \w+\(\): boolean/);
  });
});
