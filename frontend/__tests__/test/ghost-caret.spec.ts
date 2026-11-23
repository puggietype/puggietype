import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GHOST_STORAGE_KEY,
  GHOST_TOGGLE_KEY,
} from "../../src/ts/test/ghost-race";
import type { CompletedResult } from "../../src/ts/states/test";
import type { EventLog } from "../../src/ts/test/events/types";

const fake = vi.hoisted(() => ({
  flag: true,
  raceActive: false,
  pbEligible: true,
  /** correct chars over the whole log (getChars without a time limit) */
  totalChars: 300,
}));

vi.mock("../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: (flag: string) => flag === "ghostRace" && fake.flag,
}));
vi.mock("../../src/ts/multiplayer/engine-hooks", () => ({
  isRaceActive: () => fake.raceActive,
}));
vi.mock("../../src/ts/test/result-pb", () => ({
  getPbEligibility: () => ({ value: fake.pbEligible }),
}));
vi.mock("../../src/ts/test/events/stats", () => ({
  // 10 correct chars per second
  getChars: (_log: unknown, _partial: boolean, t?: number) => ({
    correctWord: t === undefined ? fake.totalChars : t / 100,
  }),
}));

const KEY = "time|30|false|false|english|normal|false";
const eventLog = { events: [], context: {} } as unknown as EventLog;

function result(overrides: Partial<CompletedResult> = {}): CompletedResult {
  return {
    mode: "time",
    mode2: "30",
    punctuation: false,
    numbers: false,
    language: "english",
    difficulty: "normal",
    lazyMode: false,
    funbox: [],
    wpm: 80,
    acc: 97,
    testDuration: 30,
    ...overrides,
  } as CompletedResult;
}

function storedGhost(wpm: number): string {
  return JSON.stringify({
    [KEY]: {
      v: 1,
      wpm,
      acc: 95,
      recordedAt: 1,
      durationMs: 30_000,
      samples: [
        [0, 0],
        [30_000, 300],
      ],
    },
  });
}

type ConfigStore = typeof import("../../src/ts/config/store");
// fresh modules per test (the toggle is read on import); Config is the
// instance ghost-caret sees
let Config: ConfigStore["Config"];

async function load(): Promise<typeof import("../../src/ts/test/ghost-caret")> {
  vi.resetModules();
  Config = (await import("../../src/ts/config/store")).Config;
  Object.assign(Config, {
    mode: "time",
    time: 30,
    punctuation: false,
    numbers: false,
    language: "english",
    difficulty: "normal",
    lazyMode: false,
    funbox: [],
    resultSaving: true,
  });
  return import("../../src/ts/test/ghost-caret");
}

describe("ghost caret runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    localStorage.clear();
    fake.flag = true;
    fake.raceActive = false;
    fake.pbEligible = true;
    fake.totalChars = 300;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("flag off", () => {
    beforeEach(() => {
      fake.flag = false;
    });

    it("writes nothing, even with old ghost data and the toggle stored", async () => {
      localStorage.setItem(GHOST_TOGGLE_KEY, "1");
      localStorage.setItem(GHOST_STORAGE_KEY, storedGhost(50));
      const before = { ...localStorage };
      const ghost = await load();

      ghost.setGhostRaceEnabled(false);
      ghost.clearAllGhosts();
      ghost.recordResult(result({ wpm: 200 }), eventLog);
      vi.runAllTimers();

      expect({ ...localStorage }).toEqual(before);
    });

    it("shows no hint", async () => {
      localStorage.setItem(GHOST_TOGGLE_KEY, "1");
      localStorage.setItem(GHOST_STORAGE_KEY, storedGhost(50));
      const ghost = await load();
      ghost.init();
      expect(ghost.getGhostHint()).toBeUndefined();
    });
  });

  describe("flag on", () => {
    it("toggle off by default: no hint, no recording", async () => {
      const ghost = await load();
      expect(ghost.isGhostRaceEnabled()).toBe(false);
      ghost.init();
      expect(ghost.getGhostHint()).toBeUndefined();
      ghost.recordResult(result(), eventLog);
      vi.runAllTimers();
      expect(localStorage.getItem(GHOST_STORAGE_KEY)).toBeNull();
    });

    it("toggle persists locally as '1'", async () => {
      const ghost = await load();
      ghost.setGhostRaceEnabled(true);
      expect(localStorage.getItem(GHOST_TOGGLE_KEY)).toBe("1");
      expect(ghost.isGhostRaceEnabled()).toBe(true);
      ghost.setGhostRaceEnabled(false);
      expect(localStorage.getItem(GHOST_TOGGLE_KEY)).toBeNull();
    });

    describe("toggle on", () => {
      beforeEach(() => {
        localStorage.setItem(GHOST_TOGGLE_KEY, "1");
      });

      it("hint asks for a PB when there's no ghost", async () => {
        const ghost = await load();
        ghost.init();
        expect(ghost.getGhostHint()).toBe(
          "set a personal best here to create your ghost",
        );
      });

      it("hint shows the ghost's wpm for the same config only", async () => {
        localStorage.setItem(GHOST_STORAGE_KEY, storedGhost(81.4));
        const ghost = await load();
        ghost.init();
        expect(ghost.getGhostHint()).toBe("racing your ghost · 81 wpm");
        Config.time = 60;
        ghost.init();
        expect(ghost.getGhostHint()).toBe(
          "set a personal best here to create your ghost",
        );
      });

      it("no hint in quote/zen/custom modes, with a funbox or in a race", async () => {
        const ghost = await load();
        for (const mode of ["quote", "zen", "custom"] as const) {
          Config.mode = mode;
          ghost.init();
          expect(ghost.getGhostHint()).toBeUndefined();
        }
        Config.mode = "time";
        Config.funbox = ["mirror"];
        ghost.init();
        expect(ghost.getGhostHint()).toBeUndefined();
        Config.funbox = [];
        fake.raceActive = true;
        ghost.init();
        expect(ghost.getGhostHint()).toBeUndefined();
      });

      it("records a PB run with its progress timeline", async () => {
        const ghost = await load();
        ghost.recordResult(result({ wpm: 80 }), eventLog);
        vi.runAllTimers();
        const stored = JSON.parse(
          localStorage.getItem(GHOST_STORAGE_KEY) ?? "{}",
        ) as Record<string, { wpm: number; samples: [number, number][] }>;
        expect(Object.keys(stored)).toEqual([KEY]);
        expect(stored[KEY]?.wpm).toBe(80);
        expect(stored[KEY]?.samples[0]).toEqual([0, 0]);
        expect(stored[KEY]?.samples.at(-1)).toEqual([30_000, 300]);
      });

      it("replaces only with a faster run", async () => {
        localStorage.setItem(GHOST_STORAGE_KEY, storedGhost(80));
        const ghost = await load();
        ghost.recordResult(result({ wpm: 80 }), eventLog);
        ghost.recordResult(result({ wpm: 70 }), eventLog);
        vi.runAllTimers();
        expect(localStorage.getItem(GHOST_STORAGE_KEY)).toBe(storedGhost(80));
        ghost.recordResult(result({ wpm: 95 }), eventLog);
        vi.runAllTimers();
        const stored = JSON.parse(
          localStorage.getItem(GHOST_STORAGE_KEY) ?? "{}",
        ) as Record<string, { wpm: number }>;
        expect(stored[KEY]?.wpm).toBe(95);
      });

      it("skips ineligible, funbox, out-of-scope mode and race results", async () => {
        const ghost = await load();
        fake.pbEligible = false;
        ghost.recordResult(result(), eventLog);
        fake.pbEligible = true;
        ghost.recordResult(result({ funbox: ["mirror"] }), eventLog);
        ghost.recordResult(result({ mode: "quote", mode2: "1" }), eventLog);
        ghost.recordResult(result({ mode: "zen", mode2: "zen" }), eventLog);
        fake.raceActive = true;
        ghost.recordResult(result(), eventLog);
        vi.runAllTimers();
        expect(localStorage.getItem(GHOST_STORAGE_KEY)).toBeNull();
      });

      it("doesn't record while result saving is off", async () => {
        const ghost = await load();
        Config.resultSaving = false;
        ghost.recordResult(result(), eventLog);
        vi.runAllTimers();
        expect(localStorage.getItem(GHOST_STORAGE_KEY)).toBeNull();
      });

      it("words mode: duration is the run time, last sample the total correct chars", async () => {
        const ghost = await load();
        // the final keystroke lands after the 10ms-rounded duration
        fake.totalChars = 130;
        ghost.recordResult(
          result({ mode: "words", mode2: "25", testDuration: 12.345 }),
          eventLog,
        );
        vi.runAllTimers();
        const stored = JSON.parse(
          localStorage.getItem(GHOST_STORAGE_KEY) ?? "{}",
        ) as Record<
          string,
          { durationMs: number; samples: [number, number][] }
        >;
        const ghostEntry = stored["words|25|false|false|english|normal|false"];
        expect(ghostEntry?.durationMs).toBe(12_345);
        expect(ghostEntry?.samples.at(-1)).toEqual([12_345, 130]);
        expect(ghostEntry?.samples.at(-2)).toEqual([12_250, 122]);
      });

      it("time mode: the replay stops at durationMs", async () => {
        localStorage.setItem(GHOST_STORAGE_KEY, storedGhost(80));
        const ghost = await load();
        const { ElementWithUtils } = await import("../../src/ts/utils/dom");
        const el = (id: string): InstanceType<typeof ElementWithUtils> => {
          const div = document.createElement("div");
          div.id = id;
          document.body.append(div);
          return new ElementWithUtils(div);
        };
        const controller = new AbortController();
        ghost.initElement(
          {
            caret: el("ghostCaret"),
            words: el("words"),
            wordsWrapper: el("wordsWrapper"),
          },
          controller.signal,
        );
        ghost.init();
        ghost.start(performance.now());
        expect(ghost.caret?.isHidden()).toBe(false);
        vi.advanceTimersByTime(29_000);
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        vi.advanceTimersByTime(1_200);
        expect(vi.getTimerCount()).toBe(0);
        ghost.reset();
        expect(ghost.caret?.isHidden()).toBe(true);
        controller.abort();
        document.body.innerHTML = "";
      });

      it("clear ghosts removes stored ghosts", async () => {
        localStorage.setItem(GHOST_STORAGE_KEY, storedGhost(80));
        const ghost = await load();
        ghost.clearAllGhosts();
        expect(localStorage.getItem(GHOST_STORAGE_KEY)).toBeNull();
        ghost.init();
        expect(ghost.getGhostHint()).toBe(
          "set a personal best here to create your ghost",
        );
      });
    });
  });
});
