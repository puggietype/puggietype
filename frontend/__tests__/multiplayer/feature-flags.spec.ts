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
  it("are all on by default (prod: no VITE_FLAGS, no ?flags)", () => {
    const flags = resolveFlags("", memoryStorage(), undefined);
    expect([...flags].sort()).toEqual(["characterSelect", "opponentDogs"]);
  });

  it("parses known flags only", () => {
    expect(parseFlagList("characterSelect, opponentDogs,bogus,")).toEqual([
      "characterSelect",
      "opponentDogs",
    ]);
    expect(parseFlagList(null)).toEqual([]);
  });

  it("build-time VITE_FLAGS limits the flags", () => {
    expect([...resolveFlags("", memoryStorage(), "opponentDogs")]).toEqual([
      "opponentDogs",
    ]);
    expect(resolveFlags("", memoryStorage(), "none").size).toBe(0);
    expect(resolveFlags("", memoryStorage(), "").size).toBe(2);
  });

  it("?flags=<list> limits the tab to those flags and persists", () => {
    const storage = memoryStorage();
    const flags = resolveFlags("?flags=characterSelect", storage, undefined);
    expect([...flags]).toEqual(["characterSelect"]);
    expect(storage.data.get(FLAGS_SESSION_KEY)).toBe("characterSelect");
    // a later page load without the param keeps the override
    expect([...resolveFlags("", storage, undefined)]).toEqual([
      "characterSelect",
    ]);
  });

  it("?flags=none is a kill switch for the rest of the tab", () => {
    const storage = memoryStorage();
    expect(resolveFlags("?flags=none", storage, undefined).size).toBe(0);
    expect(resolveFlags("", storage, undefined).size).toBe(0);
    // beats the build-time list too
    expect(resolveFlags("", storage, "characterSelect").size).toBe(0);
  });

  it("?flags=default (or any unknown value) clears the override", () => {
    const storage = memoryStorage({ [FLAGS_SESSION_KEY]: "none" });
    expect(resolveFlags("?flags=default", storage, undefined).size).toBe(2);
    expect(storage.data.has(FLAGS_SESSION_KEY)).toBe(false);
  });
});
