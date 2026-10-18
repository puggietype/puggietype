import { describe, expect, it } from "vitest";

import {
  DEFAULT_OFF_FLAGS,
  FEATURE_FLAGS,
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
  it("default on incl. openRooms; quickMatch and report off (prod: no VITE_FLAGS, no ?flags)", () => {
    const flags = resolveFlags("", memoryStorage(), undefined);
    expect([...flags].sort()).toEqual(
      ["characterSelect", "opponentDogs", "openRooms"].sort(),
    );
    expect(DEFAULT_OFF_FLAGS).toEqual(["quickMatch", "report"]);
    expect(flags.has("quickMatch")).toBe(false);
    expect(flags.has("report")).toBe(false);
  });

  it("quickMatch and report stay off with ?flags=default and an empty build list", () => {
    for (const flags of [
      resolveFlags("?flags=default", memoryStorage(), undefined),
      resolveFlags("", memoryStorage(), ""),
      resolveFlags("?flags=bogus", memoryStorage(), undefined),
    ]) {
      expect(flags.has("quickMatch")).toBe(false);
      expect(flags.has("report")).toBe(false);
    }
  });

  it("quickMatch and report turn on only when listed", () => {
    const flags = resolveFlags(
      "?flags=openRooms,quickMatch,report",
      memoryStorage(),
      undefined,
    );
    expect([...flags].sort()).toEqual(["openRooms", "quickMatch", "report"]);
  });

  it("default set is FEATURE_FLAGS minus DEFAULT_OFF_FLAGS", () => {
    const expected = FEATURE_FLAGS.filter(
      (f) => !DEFAULT_OFF_FLAGS.includes(f),
    );
    expect([...resolveFlags("", memoryStorage(), undefined)]).toEqual(expected);
    expect([...resolveFlags("?flags=default", memoryStorage(), "")]).toEqual(
      expected,
    );
  });

  it("every flag (incl. DEFAULT_OFF_FLAGS) turns on when listed", () => {
    for (const flag of FEATURE_FLAGS) {
      expect(
        resolveFlags(`?flags=${flag}`, memoryStorage(), undefined),
      ).toEqual(new Set([flag]));
      expect(resolveFlags("", memoryStorage(), flag)).toEqual(new Set([flag]));
    }
  });

  it("parses known flags only", () => {
    expect(
      parseFlagList("characterSelect, opponentDogs,openRooms,bogus,"),
    ).toEqual(["characterSelect", "opponentDogs", "openRooms"]);
    expect(parseFlagList(null)).toEqual([]);
  });

  it("build-time VITE_FLAGS limits the flags", () => {
    expect([...resolveFlags("", memoryStorage(), "opponentDogs")]).toEqual([
      "opponentDogs",
    ]);
    expect(
      resolveFlags("", memoryStorage(), "opponentDogs").has("openRooms"),
    ).toBe(false);
    expect(resolveFlags("", memoryStorage(), "none").size).toBe(0);
    expect(resolveFlags("", memoryStorage(), "").size).toBe(3);
  });

  it("?flags=<list> limits the tab to those flags and persists", () => {
    const storage = memoryStorage();
    const flags = resolveFlags("?flags=characterSelect", storage, undefined);
    expect([...flags]).toEqual(["characterSelect"]);
    expect(flags.has("openRooms")).toBe(false);
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
    expect(resolveFlags("?flags=default", storage, undefined).size).toBe(3);
    expect(storage.data.has(FLAGS_SESSION_KEY)).toBe(false);
  });
});
