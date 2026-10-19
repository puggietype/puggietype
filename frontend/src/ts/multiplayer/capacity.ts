import { createSignal } from "solid-js";

/** close codes for "server full": 4503 now, 4002 from older servers */
export const FULL_CLOSE_CODES: ReadonlySet<number> = new Set([4503, 4002]);
export const DEFAULT_RETRY_MS = 60_000;
/** random extra wait so a crowd of full clients doesn't retry in lockstep */
export const RETRY_JITTER_MS = 3_000;
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 10 * 60_000;

/** copy for the full state, in one place */
export const FULL_TEXT = {
  title: "We're full right now",
  body: "Try again in a minute.",
  retryingIn: (s: number) => `trying again in ${s}s`,
  retrying: "trying again...",
  tryNow: "Try now",
  solo: "Practice solo while you wait",
} as const;

/** what was refused: the socket itself, or a new room (create, join, Quick Match) */
export type FullScope = "socket" | "room";

export type FullState = {
  scope: FullScope;
  /** epoch ms of the automatic retry */
  retryAt: number;
  /** a retry went out and has no answer yet */
  retrying: boolean;
};

/** the server's hint (clamped, 60 s when missing or junk) plus a little jitter */
export function retryDelay(
  retryAfterMs: number | undefined,
  random: () => number = Math.random,
): number {
  const base =
    typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)
      ? Math.min(MAX_RETRY_MS, Math.max(MIN_RETRY_MS, retryAfterMs))
      : DEFAULT_RETRY_MS;
  return base + Math.floor(random() * RETRY_JITTER_MS);
}

/** whole seconds until the retry, never negative */
export function secondsLeft(retryAt: number, now: number): number {
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

export const [serverFull, setServerFull] = createSignal<
  FullState | undefined
>();

let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryFn: (() => void) | undefined;

/**
 * The server is full: show the full state and retry once `retryAfterMs`
 * (plus jitter) is up. Entering again (a retry was refused) restarts the wait.
 */
export function enterFull(
  scope: FullScope,
  retryAfterMs: number | undefined,
  retry: () => void,
): void {
  clearTimeout(retryTimer);
  retryFn = retry;
  const delay = retryDelay(retryAfterMs);
  setServerFull({ scope, retryAt: Date.now() + delay, retrying: false });
  retryTimer = setTimeout(retryFullNow, delay);
}

/** "Try now", or the timer ran out: retry, keeping the full state until answered */
export function retryFullNow(): void {
  const state = serverFull();
  const fn = retryFn;
  if (state === undefined || fn === undefined) return;
  clearTimeout(retryTimer);
  setServerFull({ ...state, retrying: true });
  fn();
}

/** we got in (or gave up waiting): drop the full state and its timer */
export function clearFull(): void {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  retryFn = undefined;
  setServerFull(undefined);
}
