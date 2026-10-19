import { describe, expect, it } from "vitest";

import {
  applyQueueStatus,
  claimedWpm,
  queueBandText,
  queueElapsedText,
  startQueue,
} from "../../src/ts/multiplayer/quick-match";

describe("quick match queue state", () => {
  it("starts joining, with no band yet", () => {
    const s = startQueue(1000);
    expect(s).toEqual({ phase: "joining", since: 1000 });
    expect(queueBandText(s)).toBe("checking your pace...");
  });

  it("queue:status moves to queued and re-syncs the start from waitedMs", () => {
    const s = applyQueueStatus(
      { band: "60–80 wpm", widenedTo: "40–100 wpm", waitedMs: 7000 },
      20_000,
    );
    expect(s).toEqual({
      phase: "queued",
      since: 13_000,
      band: "60–80 wpm",
      widenedTo: "40–100 wpm",
    });
    expect(queueBandText(s)).toBe("your pace: 60–80 wpm · matching 40–100 wpm");
    expect(queueElapsedText(s.since, 20_000)).toBe("0:07");
  });

  it("shows the band alone until the range widens", () => {
    const s = applyQueueStatus(
      { band: "<20 wpm", widenedTo: "<20 wpm", waitedMs: 0 },
      0,
    );
    expect(queueBandText(s)).toBe("your pace: <20 wpm");
  });

  it("tolerates malformed status fields", () => {
    const s = applyQueueStatus(
      { band: 5, widenedTo: "x".repeat(500), waitedMs: -50 },
      100,
    );
    expect(s.since).toBe(100);
    expect(s.band).toBeUndefined();
    expect(s.widenedTo).toHaveLength(32);
    expect(
      applyQueueStatus({ band: "", widenedTo: "", waitedMs: NaN }, 5).since,
    ).toBe(5);
  });

  it("formats the elapsed timer as m:ss", () => {
    expect(queueElapsedText(0, 0)).toBe("0:00");
    expect(queueElapsedText(0, 59_999)).toBe("0:59");
    expect(queueElapsedText(0, 83_000)).toBe("1:23");
    expect(queueElapsedText(10, 0)).toBe("0:00");
  });
});

describe("claimed wpm", () => {
  it("rounds the recent average and clamps it like the server", () => {
    expect(claimedWpm(72.6)).toBe(73);
    expect(claimedWpm(900)).toBe(300);
  });

  it("sends none without usable results", () => {
    expect(claimedWpm(undefined)).toBeUndefined();
    expect(claimedWpm(0)).toBeUndefined();
    expect(claimedWpm(-3)).toBeUndefined();
    expect(claimedWpm(NaN)).toBeUndefined();
    expect(claimedWpm(Infinity)).toBeUndefined();
  });

  it("keeps a monotonic start across status updates within RESYNC_MS (no stutter)", () => {
    const a = applyQueueStatus(
      { band: "x", widenedTo: "x", waitedMs: 0 },
      10_040,
    );
    // next status: server says 1000ms, but it arrived 90ms late
    const b = applyQueueStatus(
      { band: "x", widenedTo: "x", waitedMs: 1000 },
      11_130,
      a,
    );
    expect(b.since).toBe(a.since);
    // also no jump back when the first status lands after the local join
    const j = applyQueueStatus(
      { band: "x", widenedTo: "x", waitedMs: 0 },
      10_200,
      { phase: "joining", since: 10_000 },
    );
    expect(j.since).toBe(10_000);
  });

  it("re-syncs when the local clock is off by more than RESYNC_MS", () => {
    const a = applyQueueStatus({ band: "x", widenedTo: "x", waitedMs: 0 }, 0);
    const b = applyQueueStatus(
      { band: "x", widenedTo: "x", waitedMs: 5000 },
      2000,
      a,
    );
    expect(b.since).toBe(-3000);
  });
});
