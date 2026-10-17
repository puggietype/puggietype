import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- fake animejs timer + event log

const fake = vi.hoisted(() => ({
  timer: undefined as
    | { duration: number; playing: boolean; onComplete: () => void }
    | undefined,
  events: [] as { type: string; ms: number; data: Record<string, unknown> }[],
  finishes: 0,
  raceActive: false,
}));

vi.mock("animejs", () => ({
  createTimer: (opts: { onComplete: () => void }) => {
    const t = {
      duration: 0,
      playing: false,
      onComplete: opts.onComplete,
      play: () => {
        t.playing = true;
      },
      restart: () => {
        t.playing = true;
      },
      reset: () => {
        t.playing = false;
      },
    };
    fake.timer = t;
    return t;
  },
}));
vi.mock("../../src/ts/test/events/data", () => ({
  logTestEvent: (type: string, ms: number, data: Record<string, unknown>) =>
    fake.events.push({ type, ms, data }),
  buildEventLog: () => ({ events: [] }),
  getCurrentInput: () => "",
}));
vi.mock("../../src/ts/test/events/live-cache", () => ({
  getLiveCachedAccuracy: () => 100,
  getLiveCachedTestDurationMs: () => 0,
  getLiveCachedTestSeconds: () => 0,
  getLiveCachedTimerStartMs: () =>
    fake.events.find((e) => e.data["event"] === "start")?.ms ?? null,
}));
vi.mock("../../src/ts/test/events/stats", () => ({
  getChars: () => ({ correctWord: 0, allCorrect: 0, extra: 0, incorrect: 0 }),
}));
vi.mock("../../src/ts/events/timer", () => ({
  timerEvent: {
    dispatch: (e: { key: string }) => {
      if (e.key === "finish") fake.finishes++;
    },
  },
}));
vi.mock("../../src/ts/multiplayer/engine-hooks", () => ({
  isRaceActive: () => fake.raceActive,
}));
vi.mock("../../src/ts/test/caret", () => ({ hide: vi.fn() }));
vi.mock("../../src/ts/anim", () => ({
  setLowFpsMode: vi.fn(),
  clearLowFpsMode: vi.fn(),
}));
vi.mock("../../src/ts/controllers/sound-controller", () => ({}));
vi.mock("../../src/ts/states/notifications", () => ({
  showNoticeNotification: vi.fn(),
  showErrorNotification: vi.fn(() => 1),
  removeNotification: vi.fn(),
}));

const { Config } = await import("../../src/ts/config/store");
const TestTimer = await import("../../src/ts/test/test-timer");

const steps = (): Record<string, unknown>[] =>
  fake.events.filter((e) => e.data["event"] === "step").map((e) => e.data);

describe("test timer start", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.events = [];
    fake.finishes = 0;
    fake.raceActive = false;
    Object.assign(Config, { mode: "time", time: 30, funbox: [] });
  });
  afterEach(() => {
    TestTimer.clear();
    vi.useRealTimers();
  });

  it("a normal start emits no ticks and fires a second later", async () => {
    const now = performance.now();
    await TestTimer.start(now);
    expect(steps()).toEqual([]);
    expect(fake.timer?.playing).toBe(true);
    expect(fake.timer?.duration).toBeGreaterThan(990);
    expect(fake.timer?.duration).toBeLessThanOrEqual(1000);
  });

  it("a start in the past catches up the elapsed ticks (MP-002 resume)", async () => {
    const now = performance.now() - 7300;
    await TestTimer.start(now);
    expect(steps().map((s) => s["timer"])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(steps().every((s) => s["catchup"] === true)).toBe(true);
    // next tick back on the 1s grid: at now + 8000
    expect(fake.timer?.duration).toBeCloseTo(700, -1);
    expect(fake.finishes).toBe(0);
  });

  it("a start further back than the test length finishes during catch-up", async () => {
    await TestTimer.start(performance.now() - 45_000);
    expect(fake.finishes).toBeGreaterThan(0);
  });

  it("doesn't fail a race as a slow timer after a blocking dialog", async () => {
    fake.raceActive = true;
    const now = performance.now();
    await TestTimer.start(now);
    vi.advanceTimersByTime(2500); // e.g. confirm() held the page
    fake.timer?.onComplete();
    expect(steps().map((s) => s["timer"])).toEqual([1, 2]);
    expect(steps().some((s) => s["slowTimer"] === true)).toBe(false);
  });
});
