import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PaceRecord } from "../../src/ts/multiplayer/recent-pace";

const KEY = "puggie-mp-recent-pace";

vi.mock("../../src/ts/collections/results", () => {
  throw new Error("recent-pace must not touch resultsCollection");
});

/** a fresh module per test: LocalStorageWithSchema caches in memory */
async function load(): Promise<
  typeof import("../../src/ts/multiplayer/recent-pace")
> {
  vi.resetModules();
  return import("../../src/ts/multiplayer/recent-pace");
}

const qm = (wpm: number): PaceRecord => ({
  wpm,
  mode: "time",
  mode2: "30",
  language: "english",
});

describe("recent pace", () => {
  beforeEach(() => localStorage.clear());

  it("is 50 with no local records", async () => {
    const { recentClaimedWpm } = await load();
    expect(await recentClaimedWpm()).toBe(50);
  });

  it("averages the local records", async () => {
    const { recordSoloPace, recentClaimedWpm } = await load();
    recordSoloPace(qm(80));
    recordSoloPace(qm(101));
    expect(await recentClaimedWpm()).toBe(91);
    await expect((await load()).recentClaimedWpm()).resolves.toBe(91);
  });

  it("keeps only the last 10, stored minimally", async () => {
    const { recordSoloPace, recentClaimedWpm } = await load();
    for (let i = 1; i <= 12; i++) {
      recordSoloPace({ ...qm(i * 10), uid: "u1", text: "secret" } as never);
    }
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown[];
    expect(stored).toHaveLength(10);
    expect(stored[0]).toEqual(qm(30));
    expect(Object.keys(stored[0] as object).sort()).toEqual([
      "language",
      "mode",
      "mode2",
      "wpm",
    ]);
    expect(await recentClaimedWpm()).toBe(75);
  });

  it("prefers time 30 english records", async () => {
    const { recordSoloPace, recentClaimedWpm } = await load();
    recordSoloPace(qm(60));
    recordSoloPace({ ...qm(200), mode2: "60" });
    recordSoloPace({ ...qm(200), language: "german" });
    recordSoloPace({
      wpm: 200,
      mode: "words",
      mode2: "30",
      language: "english",
    });
    recordSoloPace(qm(70));
    expect(await recentClaimedWpm()).toBe(65);
  });

  it("falls back to any local records", async () => {
    const { recordSoloPace, recentClaimedWpm } = await load();
    recordSoloPace({
      wpm: 90,
      mode: "words",
      mode2: "25",
      language: "english",
    });
    recordSoloPace({ ...qm(110), language: "spanish" });
    expect(await recentClaimedWpm()).toBe(100);
  });

  it("never imports resultsCollection", async () => {
    // the module mock above throws on import, so loading proves it
    const { recordSoloPace, recentClaimedWpm } = await load();
    recordSoloPace(qm(40));
    expect(await recentClaimedWpm()).toBe(40);
  });
});
