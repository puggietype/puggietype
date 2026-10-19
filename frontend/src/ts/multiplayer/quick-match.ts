import { MAX_CLAIMED_WPM } from "./protocol";

/**
 * Quick Match queue as the client sees it: "joining" until the first
 * queue:status, then "queued" with the server's pace band. `since` is the
 * local time the wait started. It is re-synced from `waitedMs` only when the
 * local clock has drifted by more than RESYNC_MS: re-basing on every status
 * (once a second, shifted by network/tick jitter) made the timer stutter.
 */
export type QueueState = {
  phase: "joining" | "queued";
  since: number;
  band?: string;
  widenedTo?: string;
};

/** band strings come from the server; cap them so a bad one can't wreck the layout */
const MAX_BAND_TEXT = 32;

export function startQueue(now: number): QueueState {
  return { phase: "joining", since: now };
}

/** keep the local start unless the server's elapsed time disagrees by more than this */
export const RESYNC_MS = 1500;

export function applyQueueStatus(
  status: { band: unknown; widenedTo: unknown; waitedMs: unknown },
  now: number,
  prev?: QueueState,
): QueueState {
  const waited =
    typeof status.waitedMs === "number" && Number.isFinite(status.waitedMs)
      ? Math.max(0, status.waitedMs)
      : 0;
  return {
    phase: "queued",
    since:
      prev !== undefined && Math.abs(prev.since - (now - waited)) <= RESYNC_MS
        ? prev.since
        : now - waited,
    band: bandString(status.band),
    widenedTo: bandString(status.widenedTo),
  };
}

function bandString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_BAND_TEXT);
  return trimmed === "" ? undefined : trimmed;
}

/** "your pace: 60–80 wpm · matching 40–100 wpm", or a placeholder before the first status */
export function queueBandText(state: QueueState): string {
  if (state.band === undefined) return "checking your pace...";
  const pace = `your pace: ${state.band}`;
  return state.widenedTo === undefined || state.widenedTo === state.band
    ? pace
    : `${pace} · matching ${state.widenedTo}`;
}

/** "0:07", "1:23" */
export function queueElapsedText(since: number, now: number): string {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The pace sent with queue:join: the recent average rounded and clamped like
 * the server does, or none (the server then assumes 50) without results.
 */
export function claimedWpm(avg: number | undefined): number | undefined {
  if (avg === undefined || !Number.isFinite(avg) || avg <= 0) return undefined;
  return Math.min(MAX_CLAIMED_WPM, Math.round(avg));
}
