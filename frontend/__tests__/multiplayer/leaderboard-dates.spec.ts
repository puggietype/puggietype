import { describe, expect, it } from "vitest";

import {
  boardHeading,
  formatLeaderboardDate,
  rangeText,
} from "../../src/ts/multiplayer/leaderboard-dates";

const LA = "America/Los_Angeles";
const TOKYO = "Asia/Tokyo";
const UTC = "UTC";
const DAY = 24 * 60 * 60 * 1000;

const dec1 = Date.UTC(2026, 11, 1);

describe("formatLeaderboardDate", () => {
  it("shows UTC Dec 1 00:00 in the viewer's zone with the year", () => {
    expect(formatLeaderboardDate(new Date(dec1), LA)).toBe("Nov 30, 2026");
    expect(formatLeaderboardDate(new Date(dec1), TOKYO)).toBe("Dec 1, 2026");
    expect(formatLeaderboardDate(new Date(dec1), UTC)).toBe("Dec 1, 2026");
  });

  it("crosses the year boundary by zone", () => {
    const jan1 = new Date(Date.UTC(2027, 0, 1));
    expect(formatLeaderboardDate(jan1, LA)).toBe("Dec 31, 2026");
    expect(formatLeaderboardDate(jan1, UTC)).toBe("Jan 1, 2027");
    const dec31Late = new Date(Date.UTC(2026, 11, 31, 20));
    expect(formatLeaderboardDate(dec31Late, TOKYO)).toBe("Jan 1, 2027");
    expect(formatLeaderboardDate(dec31Late, UTC)).toBe("Dec 31, 2026");
  });
});

describe("rangeText", () => {
  it("treats endsAt as exclusive for a UTC day", () => {
    expect(rangeText(dec1, dec1 + DAY, UTC)).toBe("Dec 1, 2026");
    expect(rangeText(dec1, dec1 + DAY, LA)).toBe("Nov 30, 2026 – Dec 1, 2026");
    expect(rangeText(dec1, dec1 + DAY, TOKYO)).toBe(
      "Dec 1, 2026 – Dec 2, 2026",
    );
  });

  it("shows a week with the year on both dates", () => {
    const monday = Date.UTC(2026, 10, 2);
    expect(rangeText(monday, monday + 7 * DAY, UTC)).toBe(
      "Nov 2, 2026 – Nov 8, 2026",
    );
    expect(rangeText(monday, monday + 7 * DAY, LA)).toBe(
      "Nov 1, 2026 – Nov 8, 2026",
    );
  });

  it("spans a year boundary", () => {
    const monday = Date.UTC(2026, 11, 28);
    expect(rangeText(monday, monday + 7 * DAY, UTC)).toBe(
      "Dec 28, 2026 – Jan 3, 2027",
    );
    const jan1 = Date.UTC(2027, 0, 1);
    expect(rangeText(jan1, jan1 + DAY, LA)).toBe("Dec 31, 2026 – Jan 1, 2027");
    expect(rangeText(jan1, jan1 + DAY, UTC)).toBe("Jan 1, 2027");
  });

  it("accepts epoch seconds", () => {
    expect(rangeText(dec1 / 1000, (dec1 + DAY) / 1000, UTC)).toBe(
      "Dec 1, 2026",
    );
  });

  it("handles open-ended and unusable times", () => {
    expect(rangeText(dec1, null, UTC)).toBe("since Dec 1, 2026");
    expect(rangeText(Number.NaN, dec1, UTC)).toBe("");
    expect(rangeText(dec1, Number.NaN, UTC)).toBe("Dec 1, 2026");
  });
});

describe("boardHeading", () => {
  const allTime = {
    period: "all-time" as const,
    periodKey: "all",
    startsAt: Date.UTC(2025, 11, 1),
    endsAt: dec1,
    earliestAt: Date.UTC(2026, 9, 17, 12),
  };

  it("shows All-time since the earliest record, not the window", () => {
    expect(boardHeading(allTime, UTC)).toBe("All-time · Since Oct 17, 2026");
    expect(boardHeading(allTime, LA)).toBe("All-time · Since Oct 17, 2026");
  });

  it("formats the earliest record in the viewer's zone", () => {
    const board = { ...allTime, earliestAt: dec1 };
    expect(boardHeading(board, LA)).toBe("All-time · Since Nov 30, 2026");
    expect(boardHeading(board, TOKYO)).toBe("All-time · Since Dec 1, 2026");
    expect(boardHeading(board, UTC)).toBe("All-time · Since Dec 1, 2026");
  });

  it("keeps the year when the earliest record is in another year", () => {
    const board = { ...allTime, earliestAt: Date.UTC(2025, 11, 31, 23) };
    expect(boardHeading(board, UTC)).toBe("All-time · Since Dec 31, 2025");
    expect(boardHeading(board, TOKYO)).toBe("All-time · Since Jan 1, 2026");
  });

  it("is plain All-time without an earliest record", () => {
    expect(boardHeading({ ...allTime, earliestAt: null }, UTC)).toBe(
      "All-time",
    );
    expect(boardHeading({ ...allTime, earliestAt: Number.NaN }, UTC)).toBe(
      "All-time",
    );
  });

  it("keeps the period key and range for daily and weekly", () => {
    expect(
      boardHeading(
        {
          period: "daily",
          periodKey: "2026-12-01",
          startsAt: dec1,
          endsAt: dec1 + DAY,
          earliestAt: null,
        },
        LA,
      ),
    ).toBe("2026-12-01 · Nov 30, 2026 – Dec 1, 2026");
    expect(
      boardHeading(
        {
          period: "weekly",
          periodKey: "2026-W53",
          startsAt: Date.UTC(2026, 11, 28),
          endsAt: Date.UTC(2027, 0, 4),
          earliestAt: null,
        },
        UTC,
      ),
    ).toBe("2026-W53 · Dec 28, 2026 – Jan 3, 2027");
  });

  it("falls back to the period key when times are unusable", () => {
    expect(
      boardHeading(
        {
          period: "daily",
          periodKey: "2026-12-01",
          startsAt: Number.NaN,
          endsAt: null,
          earliestAt: null,
        },
        UTC,
      ),
    ).toBe("2026-12-01");
  });
});
