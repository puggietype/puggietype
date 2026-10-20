import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Legal condition (QM-009): the IndexedDB get-or-create (acquireClientId) may
// run only in the find-match click path, never at app start, in connect() or
// in onMount.
const SRC = join(__dirname, "../../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("acquireClientId call sites (QM-009 Legal condition)", () => {
  const all = files(SRC);

  it("is referenced (outside comments) only by client-id.ts and RaceHome.tsx", () => {
    const users = all
      .filter((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
          .some((l) => l.includes("acquireClientId")),
      )
      .map((f) => relative(SRC, f).replaceAll("\\", "/"))
      .sort();
    expect(users).toEqual([
      "ts/multiplayer/client-id.ts",
      "ts/multiplayer/components/RaceHome.tsx",
    ]);
  });

  it("is called exactly once in RaceHome, inside findMatch", () => {
    const src = readFileSync(
      join(SRC, "ts/multiplayer/components/RaceHome.tsx"),
      "utf8",
    );
    const calls = [...src.matchAll(/acquireClientId\(\)/g)];
    expect(calls).toHaveLength(1);
    const start = src.indexOf("const findMatch = (): void => {");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\n  };", start);
    const at = calls[0]?.index ?? -1;
    expect(at).toBeGreaterThan(start);
    expect(at).toBeLessThan(end);
    // and findMatch is never invoked from onMount
    for (const m of src.matchAll(/onMount\(([\s\S]*?)\);\n/g)) {
      expect(m[1]).not.toMatch(/findMatch|acquireClientId/);
    }
  });

  it("client-id.ts never opens IndexedDB at module load", () => {
    const src = readFileSync(join(SRC, "ts/multiplayer/client-id.ts"), "utf8");
    // indexedDB is only touched inside openDb() and acquireClientId()
    const top = src
      .split("\n")
      .filter((l) => l.includes("indexedDB.") && !/^\s/.test(l));
    expect(top).toEqual([]);
  });

  it("race.ts (connect/joinQueue) does not call acquireClientId", () => {
    const src = readFileSync(join(SRC, "ts/multiplayer/race.ts"), "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    expect(src).not.toMatch(/acquireClientId\(/);
  });
});
