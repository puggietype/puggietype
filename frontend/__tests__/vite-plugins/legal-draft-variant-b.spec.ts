import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const draft = path.join(
  repoRoot,
  "docs/legal-drafts/privacy-steam-variant-b.md",
);
const FIRST_LINE =
  "DRAFT - NOT IN EFFECT. This is not PuggieType's privacy policy; the current policy is at https://puggietype.com/privacy.";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("privacy variant B draft", () => {
  it("starts with the exact DRAFT - NOT IN EFFECT line", () => {
    expect(readFileSync(draft, "utf8").split("\n")[0]).toBe(FIRST_LINE);
  });

  it("is not linked or referenced from the site", () => {
    const files = ["src", "static"].flatMap((d) =>
      walk(path.resolve(__dirname, "../..", d)),
    );
    const hits = files.filter((f) => {
      if (!/\.(ts|tsx|js|mjs|html|md|json|scss|css|txt|xml)$/.test(f)) {
        return false;
      }
      const t = readFileSync(f, "utf8");
      return (
        t.includes("legal-drafts") || t.includes("privacy-steam-variant-b")
      );
    });
    expect(hits).toEqual([]);
  });
});
