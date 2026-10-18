import { describe, expect, it } from "vitest";

import {
  FLAGS_SESSION_KEY,
  parseFlagList,
  resolveFlags,
} from "../../src/ts/multiplayer/feature-flags";

type MemoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  data: Map<string, string>;
};

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("feature flags", () => {
  it("are all off by default (prod: no VITE_FLAGS, no ?flags)", () => {
    const flags = resolveFlags("", memoryStorage(), undefined);
    expect(flags.size).toBe(0);
  });

  it("parses known flags only", () => {
    expect(parseFlagList("characterSelect, opponentDogs,bogus,")).toEqual([
      "characterSelect",
      "opponentDogs",
    ]);
    expect(parseFlagList(null)).toEqual([]);
  });

  it("build-time VITE_FLAGS turns flags on", () => {
    const flags = resolveFlags("", memoryStorage(), "opponentDogs");
    expect([...flags]).toEqual(["opponentDogs"]);
  });

  it("?flags= turns flags on and persists them for the tab", () => {
    const storage = memoryStorage();
    const flags = resolveFlags(
      "?flags=characterSelect,opponentDogs",
      storage,
      undefined,
    );
    expect([...flags].sort()).toEqual(["characterSelect", "opponentDogs"]);
    expect(storage.data.get(FLAGS_SESSION_KEY)).toBe(
      "characterSelect,opponentDogs",
    );
    // a later page load without the param keeps them
    expect(resolveFlags("", storage, undefined).has("characterSelect")).toBe(
      true,
    );
  });

  it("?flags=none clears the tab's flags", () => {
    const storage = memoryStorage({ [FLAGS_SESSION_KEY]: "characterSelect" });
    expect(resolveFlags("?flags=none", storage, undefined).size).toBe(0);
    expect(storage.data.has(FLAGS_SESSION_KEY)).toBe(false);
  });
});
