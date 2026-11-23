import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildGhostKey,
  buildSamples,
  charsToPosition,
  clearGhosts,
  downsampleSamples,
  GHOST_STORAGE_KEY,
  GHOST_TOGGLE_KEY,
  GhostEntry,
  GhostGate,
  GhostSample,
  GhostStorage,
  ghostHintText,
  interpolateChars,
  isGhostApplicable,
  MAX_GHOST_ENTRIES,
  MAX_GHOST_SAMPLES,
  MAX_GHOST_STORE_BYTES,
  parseGhostStore,
  putGhost,
  readGhostStore,
  readGhostToggle,
  saveGhost,
  shouldRecordGhost,
  storeBytes,
  writeGhostToggle,
} from "../../src/ts/test/ghost-race";

type MemoryStorage = GhostStorage & { data: Map<string, string> };

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function entry(overrides: Partial<GhostEntry> = {}): GhostEntry {
  return {
    v: 1,
    wpm: 80,
    acc: 97,
    recordedAt: 1_000,
    durationMs: 30_000,
    samples: [
      [0, 0],
      [15_000, 100],
      [30_000, 200],
    ],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const KEY = "time|30|false|false|english|normal|false";

const gate: GhostGate = {
  flagEnabled: true,
  toggleEnabled: true,
  raceActive: false,
  mode: "time",
  funboxCount: 0,
};

describe("buildGhostKey", () => {
  it("joins mode|mode2|punctuation|numbers|language|difficulty|lazyMode", () => {
    expect(
      buildGhostKey({
        mode: "time",
        mode2: "30",
        punctuation: false,
        numbers: false,
        language: "english",
        difficulty: "normal",
        lazyMode: false,
      }),
    ).toBe(KEY);
  });

  it("differs for any config difference", () => {
    const base = {
      mode: "words",
      mode2: "25",
      punctuation: false,
      numbers: false,
      language: "english",
      difficulty: "normal",
      lazyMode: false,
    };
    const keys = new Set([
      buildGhostKey(base),
      buildGhostKey({ ...base, mode: "time" }),
      buildGhostKey({ ...base, mode2: "50" }),
      buildGhostKey({ ...base, punctuation: true }),
      buildGhostKey({ ...base, numbers: true }),
      buildGhostKey({ ...base, language: "english_1k" }),
      buildGhostKey({ ...base, difficulty: "expert" }),
      buildGhostKey({ ...base, lazyMode: true }),
    ]);
    expect(keys.size).toBe(8);
  });
});

describe("storage", () => {
  it("round trips an entry", () => {
    const storage = memoryStorage();
    expect(saveGhost(storage, KEY, entry())).toBe(true);
    expect(readGhostStore(storage)).toEqual({ [KEY]: entry() });
    expect(JSON.parse(storage.data.get(GHOST_STORAGE_KEY) ?? "")).toEqual({
      [KEY]: entry(),
    });
  });

  it("stores only timing, counts and summary numbers", () => {
    const storage = memoryStorage();
    saveGhost(storage, KEY, entry());
    const stored = JSON.parse(storage.data.get(GHOST_STORAGE_KEY) ?? "") as {
      [k: string]: Record<string, unknown>;
    };
    expect(Object.keys(stored[KEY] ?? {}).sort()).toEqual([
      "acc",
      "durationMs",
      "recordedAt",
      "samples",
      "v",
      "wpm",
    ]);
  });

  it("empty or missing storage reads as empty", () => {
    expect(readGhostStore(memoryStorage())).toEqual({});
    expect(readGhostStore(undefined)).toEqual({});
    expect(saveGhost(undefined, KEY, entry())).toBe(false);
  });

  it("discards corrupted JSON silently (debug log only)", () => {
    const debug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(parseGhostStore("{not json")).toEqual({});
    expect(parseGhostStore("[1,2]")).toEqual({});
    expect(parseGhostStore("null")).toEqual({});
    expect(parseGhostStore('"str"')).toEqual({});
    expect(debug).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("drops wrong-version and schema-invalid entries, keeps valid ones", () => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const raw = JSON.stringify({
      good: entry(),
      v2: { ...entry(), v: 2 },
      noSamples: { ...entry(), samples: [] },
      badSample: { ...entry(), samples: [[0, "x"]] },
      backwards: {
        ...entry(),
        samples: [
          [0, 5],
          [100, 3],
        ],
      },
      negative: { ...entry(), wpm: -1 },
      extraField: { ...entry(), text: "typed words" },
      tooMany: {
        ...entry(),
        samples: Array.from(
          { length: MAX_GHOST_SAMPLES + 1 },
          (_, i): GhostSample => [i, i],
        ),
      },
      notObject: 5,
    });
    expect(Object.keys(parseGhostStore(raw))).toEqual(["good"]);
  });

  it("storage that throws degrades to empty / false", () => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const throwing: GhostStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readGhostStore(throwing)).toEqual({});
    expect(saveGhost(throwing, KEY, entry())).toBe(false);
    expect(() => clearGhosts(throwing)).not.toThrow();
    expect(readGhostToggle(throwing)).toBe(false);
    expect(() => writeGhostToggle(throwing, true)).not.toThrow();
  });

  it("quota exceeded on write returns false and keeps the old value", () => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const storage = memoryStorage({
      [GHOST_STORAGE_KEY]: JSON.stringify({ [KEY]: entry() }),
    });
    storage.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    expect(saveGhost(storage, KEY, entry({ wpm: 120 }))).toBe(false);
    expect(readGhostStore(storage)[KEY]?.wpm).toBe(80);
  });

  it("clearGhosts removes the store", () => {
    const storage = memoryStorage();
    saveGhost(storage, KEY, entry());
    clearGhosts(storage);
    expect(storage.data.has(GHOST_STORAGE_KEY)).toBe(false);
  });

  it("toggle is off by default and stored as '1' / absent", () => {
    const storage = memoryStorage();
    expect(readGhostToggle(storage)).toBe(false);
    writeGhostToggle(storage, true);
    expect(storage.data.get(GHOST_TOGGLE_KEY)).toBe("1");
    expect(readGhostToggle(storage)).toBe(true);
    writeGhostToggle(storage, false);
    expect(storage.data.has(GHOST_TOGGLE_KEY)).toBe(false);
    expect(readGhostToggle(memoryStorage({ [GHOST_TOGGLE_KEY]: "yes" }))).toBe(
      false,
    );
  });
});

describe("caps", () => {
  it("downsamples evenly to the cap, keeping first and last", () => {
    const samples = Array.from({ length: 5000 }, (_, i): GhostSample => [
      i * 10,
      i,
    ]);
    const out = downsampleSamples(samples);
    expect(out).toHaveLength(MAX_GHOST_SAMPLES);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([49_990, 4999]);
    const gaps = out.slice(1).map((s, i) => s[1] - (out[i] as GhostSample)[1]);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    expect(downsampleSamples(samples.slice(0, 10))).toHaveLength(10);
  });

  it("putGhost downsamples long entries", () => {
    const samples = Array.from({ length: 3000 }, (_, i): GhostSample => [
      i * 10,
      i,
    ]);
    const next = putGhost({}, KEY, entry({ samples }));
    expect(next?.[KEY]?.samples).toHaveLength(MAX_GHOST_SAMPLES);
  });

  it("evicts the oldest recordedAt beyond the entry cap", () => {
    let store = {};
    for (let i = 0; i < MAX_GHOST_ENTRIES; i++) {
      store = putGhost(store, `k${i}`, entry({ recordedAt: 100 + i })) ?? {};
    }
    expect(Object.keys(store)).toHaveLength(MAX_GHOST_ENTRIES);
    const next = putGhost(store, "new", entry({ recordedAt: 50_000 })) ?? {};
    expect(Object.keys(next)).toHaveLength(MAX_GHOST_ENTRIES);
    expect(next).not.toHaveProperty("k0");
    expect(next).toHaveProperty("k1");
    expect(next).toHaveProperty("new");
  });

  it("replacing an existing key doesn't evict anything", () => {
    let store = {};
    for (let i = 0; i < MAX_GHOST_ENTRIES; i++) {
      store = putGhost(store, `k${i}`, entry({ recordedAt: 100 + i })) ?? {};
    }
    const next = putGhost(store, "k5", entry({ wpm: 200 })) ?? {};
    expect(Object.keys(next)).toHaveLength(MAX_GHOST_ENTRIES);
    expect(next).toHaveProperty("k0");
  });

  it("evicts oldest until the serialized store fits the byte cap", () => {
    const big = (recordedAt: number): GhostEntry =>
      entry({
        recordedAt,
        durationMs: 1_000_000,
        samples: Array.from(
          { length: MAX_GHOST_SAMPLES },
          (_, i): GhostSample => [100_000 + i * 100, 10_000 + i],
        ),
      });
    let store = {};
    for (let i = 0; i < 6; i++) {
      store = putGhost(store, `k${i}`, big(i)) ?? {};
      expect(storeBytes(store)).toBeLessThanOrEqual(MAX_GHOST_STORE_BYTES);
    }
    expect(store).toHaveProperty("k5");
    expect(store).not.toHaveProperty("k0");
    expect(Object.keys(store).length).toBeLessThan(6);
  });

  it("a single entry that can't fit is not stored", () => {
    // keys count too: one huge key pushes a lone entry past the cap
    const hugeKey = "x".repeat(MAX_GHOST_STORE_BYTES);
    expect(putGhost({}, hugeKey, entry())).toBeUndefined();
    const storage = memoryStorage();
    saveGhost(storage, KEY, entry());
    expect(saveGhost(storage, hugeKey, entry())).toBe(false);
    expect(readGhostStore(storage)).toEqual({ [KEY]: entry() });
  });
});

describe("recording rules", () => {
  const pb = { ...gate, pbEligible: true, wpm: 90 };

  it("records the first eligible run", () => {
    expect(shouldRecordGhost(pb, undefined)).toBe(true);
    expect(shouldRecordGhost({ ...pb, mode: "words" }, undefined)).toBe(true);
  });

  it("replaces only on a faster run", () => {
    expect(shouldRecordGhost(pb, entry({ wpm: 89.99 }))).toBe(true);
    expect(shouldRecordGhost(pb, entry({ wpm: 90 }))).toBe(false);
    expect(shouldRecordGhost(pb, entry({ wpm: 100 }))).toBe(false);
  });

  it("skips PB-ineligible runs", () => {
    expect(shouldRecordGhost({ ...pb, pbEligible: false }, undefined)).toBe(
      false,
    );
  });

  it("skips quote/custom/zen modes and funbox runs", () => {
    for (const mode of ["quote", "custom", "zen"]) {
      expect(shouldRecordGhost({ ...pb, mode }, undefined)).toBe(false);
    }
    expect(shouldRecordGhost({ ...pb, funboxCount: 1 }, undefined)).toBe(false);
  });

  it("skips multiplayer races", () => {
    expect(shouldRecordGhost({ ...pb, raceActive: true }, undefined)).toBe(
      false,
    );
  });

  it("needs both the flag and the toggle", () => {
    expect(shouldRecordGhost({ ...pb, flagEnabled: false }, undefined)).toBe(
      false,
    );
    expect(shouldRecordGhost({ ...pb, toggleEnabled: false }, undefined)).toBe(
      false,
    );
  });

  it("skips zero / non-finite wpm", () => {
    expect(shouldRecordGhost({ ...pb, wpm: 0 }, undefined)).toBe(false);
    expect(shouldRecordGhost({ ...pb, wpm: NaN }, undefined)).toBe(false);
  });

  it("isGhostApplicable mirrors the gate", () => {
    expect(isGhostApplicable(gate)).toBe(true);
    expect(isGhostApplicable({ ...gate, flagEnabled: false })).toBe(false);
    expect(isGhostApplicable({ ...gate, raceActive: true })).toBe(false);
    expect(isGhostApplicable({ ...gate, mode: "quote" })).toBe(false);
  });
});

describe("hint", () => {
  it("prompts for a PB without a ghost", () => {
    expect(ghostHintText(gate, undefined)).toBe(
      "set a personal best here to create your ghost",
    );
  });

  it("shows the ghost wpm when one exists", () => {
    expect(ghostHintText(gate, entry({ wpm: 87.6 }))).toBe(
      "racing your ghost · 88 wpm",
    );
  });

  it("nothing when ghosts don't apply", () => {
    expect(ghostHintText({ ...gate, flagEnabled: false }, entry())).toBe(
      undefined,
    );
    expect(ghostHintText({ ...gate, toggleEnabled: false }, entry())).toBe(
      undefined,
    );
    expect(ghostHintText({ ...gate, mode: "zen" }, undefined)).toBe(undefined);
    expect(ghostHintText({ ...gate, raceActive: true }, undefined)).toBe(
      undefined,
    );
  });
});

describe("buildSamples", () => {
  it("starts at 0, ends at durationMs, never goes backwards", () => {
    const chars = (t: number): number => (t > 500 && t < 700 ? 1 : t / 100);
    const samples = buildSamples(1000, chars);
    expect(samples[0]).toEqual([0, 0]);
    expect(samples[samples.length - 1]).toEqual([1000, 10]);
    for (let i = 1; i < samples.length; i++) {
      const [t, c] = samples[i] as GhostSample;
      const [pt, pc] = samples[i - 1] as GhostSample;
      expect(t).toBeGreaterThanOrEqual(pt);
      expect(c).toBeGreaterThanOrEqual(pc);
    }
  });

  it("stays within the sample cap for long runs", () => {
    const samples = buildSamples(3_600_000, (t) => t / 200);
    expect(samples.length).toBeLessThanOrEqual(MAX_GHOST_SAMPLES);
    expect(samples[samples.length - 1]).toEqual([3_600_000, 18_000]);
  });
});

describe("replay", () => {
  const samples: GhostSample[] = [
    [0, 0],
    [1000, 10],
    [2000, 10],
    [3000, 40],
  ];

  it("interpolates linearly between samples", () => {
    expect(interpolateChars(samples, 500)).toBe(5);
    expect(interpolateChars(samples, 1000)).toBe(10);
    expect(interpolateChars(samples, 1500)).toBe(10);
    expect(interpolateChars(samples, 2500)).toBe(25);
  });

  it("clamps before the start and after the end", () => {
    expect(interpolateChars(samples, -100)).toBe(0);
    expect(interpolateChars(samples, 3000)).toBe(40);
    expect(interpolateChars(samples, 99_999)).toBe(40);
    expect(interpolateChars([[200, 3]], 0)).toBe(3);
    expect(interpolateChars([], 100)).toBe(0);
  });

  it("handles duplicate timestamps", () => {
    expect(
      interpolateChars(
        [
          [0, 0],
          [100, 2],
          [100, 4],
          [200, 6],
        ],
        100,
      ),
    ).toBe(4);
  });

  describe("charsToPosition", () => {
    // "the" "quick" "fox"
    const lengths = [3, 5, 3];
    const wordLength = (i: number): number | undefined => lengths[i];

    it("maps chars onto word/letter like the pace caret", () => {
      expect(charsToPosition(0, wordLength)).toEqual({
        wordIndex: 0,
        letterIndex: 0,
      });
      expect(charsToPosition(2, wordLength)).toEqual({
        wordIndex: 0,
        letterIndex: 2,
      });
      // end of "the" (before the space)
      expect(charsToPosition(3, wordLength)).toEqual({
        wordIndex: 0,
        letterIndex: 3,
      });
      // space typed -> start of "quick"
      expect(charsToPosition(4, wordLength)).toEqual({
        wordIndex: 1,
        letterIndex: 0,
      });
      expect(charsToPosition(9, wordLength)).toEqual({
        wordIndex: 1,
        letterIndex: 5,
      });
      expect(charsToPosition(10, wordLength)).toEqual({
        wordIndex: 2,
        letterIndex: 0,
      });
    });

    it("floors fractional chars and clamps negatives", () => {
      expect(charsToPosition(4.9, wordLength)).toEqual({
        wordIndex: 1,
        letterIndex: 0,
      });
      expect(charsToPosition(-3, wordLength)).toEqual({
        wordIndex: 0,
        letterIndex: 0,
      });
    });

    it("stops at the end of the last known word", () => {
      expect(charsToPosition(1000, wordLength)).toEqual({
        wordIndex: 2,
        letterIndex: 3,
      });
      expect(charsToPosition(5, () => undefined)).toEqual({
        wordIndex: 0,
        letterIndex: 0,
      });
    });
  });
});
