import type { LeaderboardOk } from "./leaderboards";

/** server times may be epoch seconds or ms */
function epochMs(n: number): number {
  return Math.abs(n) < 1e12 ? n * 1000 : n;
}

function toDate(n: number | null | undefined): Date | undefined {
  if (n === null || n === undefined || !Number.isFinite(n)) return undefined;
  const date = new Date(epochMs(n));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * `MMM D, YYYY` in the viewer's time zone, or `timeZone` when given.
 * Always includes the year.
 */
export function formatLeaderboardDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
}

/**
 * Board range for the meta line. `endsAt` is exclusive, so the last day shown
 * is the one holding `endsAt - 1ms`. Empty when the times are unusable.
 */
export function rangeText(
  startsAt: number,
  endsAt: number | null,
  timeZone?: string,
): string {
  const start = toDate(startsAt);
  if (start === undefined) return "";
  const startText = formatLeaderboardDate(start, timeZone);
  if (endsAt === null) return `since ${startText}`;
  const end = toDate(endsAt);
  if (end === undefined || end.getTime() <= start.getTime()) return startText;
  const endText = formatLeaderboardDate(new Date(end.getTime() - 1), timeZone);
  return startText === endText ? startText : `${startText} – ${endText}`;
}

/**
 * `All-time · Since Oct 17, 2026` from the earliest record on the board,
 * `All-time` without one. Other periods: `{periodKey} · {range}`.
 */
export function boardHeading(
  board: Pick<
    LeaderboardOk,
    "period" | "periodKey" | "startsAt" | "endsAt" | "earliestAt"
  >,
  timeZone?: string,
): string {
  if (board.period === "all-time") {
    const earliest = toDate(board.earliestAt);
    if (earliest === undefined) return "All-time";
    return `All-time · Since ${formatLeaderboardDate(earliest, timeZone)}`;
  }
  const range = rangeText(board.startsAt, board.endsAt, timeZone);
  return range === "" ? board.periodKey : `${board.periodKey} · ${range}`;
}
