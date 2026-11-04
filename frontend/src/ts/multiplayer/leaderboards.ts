import { createSignal } from "solid-js";
import { z } from "zod";

import { CONFIGURED_WS_URL } from "./flags";
import { wsUrl } from "./helpers";
import { TIME_MODE2, WORDS_MODE2 } from "./protocol";

export const LEADERBOARD_PERIODS = [
  "daily",
  "weekly",
  "monthly",
  "all-time",
] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export const LEADERBOARD_LIMIT = 50;
const KIDS_GUIDE_PATH = "/guide/typing-for-kids";
/** set for the rest of the tab when this visit came from the kids guide */
export const KIDS_FLOW_KEY = "puggie-kids-flow";

export type LeaderboardMode = "time" | "words";

export type LeaderboardQuery = {
  period: LeaderboardPeriod;
  mode: LeaderboardMode;
  mode2: number;
  language: string;
  punctuation: boolean;
  numbers: boolean;
  limit: number;
  /** false is the separate Solo board. Multiplayer boards are true. */
  verified: boolean;
};

export type LeaderboardEntry = {
  rank: number;
  name: string;
  wpm: number;
  acc: number;
  raw: number;
  /** set by the server for the row that belongs to this session */
  isYou?: boolean;
};

export type LeaderboardOk = {
  ok: true;
  period: LeaderboardPeriod;
  periodKey: string;
  startsAt: number;
  endsAt: number | null;
  /** earliest record on this board. Null when the server does not send it. */
  earliestAt: number | null;
  mode: LeaderboardMode;
  mode2: number;
  accuracyFloor: number;
  /** false on the solo board. Omitted by an older server, which is race-only. */
  verified?: boolean;
  entries: LeaderboardEntry[];
};

export type LeaderboardErr = { ok: false; error: string; skipped?: true };
export type LeaderboardResult = LeaderboardOk | LeaderboardErr;

const EntrySchema = z.object({
  rank: z.number(),
  name: z.string(),
  wpm: z.number(),
  acc: z.number(),
  raw: z.number(),
  isYou: z.boolean().optional(),
});

const OkSchema = z.object({
  ok: z.literal(true),
  period: z.enum(LEADERBOARD_PERIODS),
  periodKey: z.string(),
  startsAt: z.number(),
  endsAt: z.number().nullable().optional(),
  earliestAt: z.number().nullable().optional(),
  mode: z.enum(["time", "words"]),
  mode2: z.number(),
  accuracyFloor: z.number(),
  verified: z.boolean().optional(),
  entries: z.array(EntrySchema),
});

const ErrSchema = z.object({
  ok: z.literal(false),
  error: z.string().min(1),
});

/**
 * Solo POST body. The nickname is on the websocket session, not this request.
 * `sessionToken` is the secret from `welcome` and the only field the server
 * needs to resolve that nickname. The public player id is not sent.
 * `chars` is the correct-character count, the same integer computeWpm uses.
 */
export type ScoreSubmission = {
  showOnLeaderboard: boolean;
  mode: LeaderboardMode;
  mode2: number;
  language: string;
  punctuation: boolean;
  numbers: boolean;
  wpm: number;
  acc: number;
  raw: number;
  /** correct characters; server requires an integer >= 1 */
  chars: number;
  durationMs: number;
  sessionToken?: string;
};

/** the toggle must have been on screen this long before a click can send */
export const SCORE_CONSENT_MS = 2000;

export function scoreConsentElapsed(shownAtMs: number, nowMs: number): boolean {
  return nowMs - shownAtMs >= SCORE_CONSENT_MS;
}

export type SoloSubmitAction = "next" | "retry" | "submit";

type SoloSubmitListener = (action: SoloSubmitAction) => void;
let soloSubmitListener: SoloSubmitListener | undefined;

/** the mounted results toggle; Next and Retry call this */
export function registerSoloSubmit(listener: SoloSubmitListener): () => void {
  soloSubmitListener = listener;
  return () => {
    if (soloSubmitListener === listener) soloSubmitListener = undefined;
  };
}

export function requestSoloSubmit(action: SoloSubmitAction): void {
  soloSubmitListener?.(action);
}

/**
 * kidsGuide on hello and race:finish. Omitted unless this server said
 * welcome.features.leaderboards, so an older server is not sent unknown keys.
 */
export function finishLeaderboardFields(options: {
  kids: boolean;
  leaderboards: boolean;
}): { kidsGuide?: true } {
  if (!options.leaderboards || !options.kids) return {};
  return { kidsGuide: true };
}

/** server accepts leaderboard:consent for this long after race:results */
export const CONSENT_AFTER_RESULTS_MS = 60_000;

export function leaderboardConsentMessage(raceId: string): {
  type: "leaderboard:consent";
  raceId: string;
  show: true;
} {
  return { type: "leaderboard:consent", raceId, show: true };
}

const [soloScoreWillPost, setSoloScoreWillPostSignal] = createSignal(false);
/** Next / Retry will also post the leaderboard score */
export { soloScoreWillPost };

export function setSoloScoreWillPost(will: boolean): void {
  setSoloScoreWillPostSignal(will);
}

/**
 * Visible label for a control that posts the score and also starts another
 * test. A generic Next is only used when the click will not post.
 */
export function soloAdvanceLabel(
  action: "next" | "repeat" | "retry",
  willPost: boolean,
): string {
  if (!willPost) {
    if (action === "next") return "Next test";
    if (action === "repeat") return "Repeat test";
    return "Retry saving result";
  }
  if (action === "next") return "Submit score & next test";
  if (action === "repeat") return "Submit score & repeat";
  return "Submit score & retry saving";
}

/** compact Multiplayer board on the race screen: hidden for kids-guide sessions */
export function showRaceLeaderboard(options: {
  leaderboards: boolean;
  kids: boolean;
  inRaceOrResults: boolean;
}): boolean {
  return options.leaderboards && !options.kids && options.inRaceOrResults;
}

/** http(s) origin for the game server that serves GET /leaderboards */
export function httpBaseFromWsUrl(ws: string): string {
  const url = new URL(ws);
  if (url.protocol === "wss:") url.protocol = "https:";
  else if (url.protocol === "ws:") url.protocol = "http:";
  return url.origin;
}

export function leaderboardHttpBase(
  location: { protocol: string; host: string; hostname: string },
  configuredWs?: string,
): string {
  return httpBaseFromWsUrl(wsUrl(location, configuredWs));
}

export function leaderboardUrl(base: string, query: LeaderboardQuery): string {
  const url = new URL("/leaderboards", `${base.replace(/\/$/, "")}/`);
  url.searchParams.set("period", query.period);
  url.searchParams.set("mode", query.mode);
  url.searchParams.set("mode2", String(query.mode2));
  url.searchParams.set("language", query.language);
  url.searchParams.set("punctuation", String(query.punctuation));
  url.searchParams.set("numbers", String(query.numbers));
  url.searchParams.set("limit", String(query.limit));
  url.searchParams.set("verified", String(query.verified));
  return url.toString();
}

export function defaultLeaderboardQuery(
  over: Partial<LeaderboardQuery> = {},
): LeaderboardQuery {
  const mode = over.mode ?? "time";
  const fallbackMode2 = mode === "time" ? 30 : 25;
  const mode2 = leaderboardMode2(mode, over.mode2 ?? fallbackMode2);
  return {
    period: over.period ?? "daily",
    mode,
    mode2: mode2 ?? fallbackMode2,
    language: over.language ?? "english",
    punctuation: over.punctuation ?? false,
    numbers: over.numbers ?? false,
    limit: over.limit ?? LEADERBOARD_LIMIT,
    verified: over.verified ?? true,
  };
}

/** mode2 the game server accepts for a mode, else undefined */
export function leaderboardMode2(
  mode: string,
  mode2: string | number,
): number | undefined {
  const n = typeof mode2 === "number" ? mode2 : Number(mode2);
  if (!Number.isInteger(n)) return undefined;
  const allowed: readonly number[] = mode === "time" ? TIME_MODE2 : WORDS_MODE2;
  if (mode !== "time" && mode !== "words") return undefined;
  return allowed.includes(n) ? n : undefined;
}

export function isKidsGuidePath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return trimmed === KIDS_GUIDE_PATH;
}

function referrerPath(referrer: string): string | undefined {
  if (referrer === "") return undefined;
  try {
    return new URL(referrer).pathname;
  } catch {
    return undefined;
  }
}

/**
 * True on /guide/typing-for-kids and for the rest of a tab that arrived from
 * that page. Those visits never submit a leaderboard score.
 */
export function leaderboardSubmitBlocked(
  pathname: string,
  referrer: string,
  storage: Pick<Storage, "getItem" | "setItem">,
): boolean {
  const fromKids =
    isKidsGuidePath(pathname) || isKidsGuidePath(referrerPath(referrer) ?? "");
  if (fromKids) {
    try {
      storage.setItem(KIDS_FLOW_KEY, "1");
    } catch {
      // storage blocked: this call is still blocked via the path check
    }
  }
  let flagged = false;
  try {
    flagged = storage.getItem(KIDS_FLOW_KEY) === "1";
  } catch {
    flagged = false;
  }
  return fromKids || flagged || isKidsGuidePath(pathname);
}

export function parseLeaderboardBody(body: unknown): LeaderboardResult {
  const err = ErrSchema.safeParse(body);
  if (err.success) return { ok: false, error: err.data.error };
  const ok = OkSchema.safeParse(body);
  if (!ok.success) {
    return { ok: false, error: "The leaderboard response was not recognized." };
  }
  return {
    ok: true,
    period: ok.data.period,
    periodKey: ok.data.periodKey,
    startsAt: ok.data.startsAt,
    endsAt: ok.data.endsAt ?? null,
    earliestAt: ok.data.earliestAt ?? null,
    mode: ok.data.mode,
    mode2: ok.data.mode2,
    accuracyFloor: ok.data.accuracyFloor,
    verified: ok.data.verified,
    entries: ok.data.entries,
  };
}

/**
 * Race and solo boards stay separate. A solo response is verified:false.
 * The Multiplayer tab accepts a Multiplayer board or an older response that omits the flag.
 * Entries from the other board are not shown.
 */
export function leaderboardMatchesBoard(
  board: { verified?: boolean },
  verified: boolean,
): boolean {
  if (verified) return board.verified !== false;
  return board.verified === false;
}

export async function fetchLeaderboard(
  base: string,
  query: LeaderboardQuery,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  /** from the existing websocket session. Not logged or written anywhere. */
  sessionToken?: string,
): Promise<LeaderboardResult> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (sessionToken !== undefined && sessionToken !== "") {
    headers["x-session-token"] = sessionToken;
  }
  try {
    const response = await fetchImpl(leaderboardUrl(base, query), {
      method: "GET",
      headers,
      signal,
    });
    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      return {
        ok: false,
        error: response.ok
          ? "The leaderboard response was not valid JSON."
          : "Couldn't load the leaderboard.",
      };
    }
    return parseLeaderboardBody(json);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return { ok: false, error: "Couldn't load the leaderboard." };
  }
}

function wholeCount(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

export function scoreFromResult(result: {
  mode: string;
  mode2: string | number;
  language?: string;
  punctuation?: boolean;
  numbers?: boolean;
  wpm: number;
  acc: number;
  rawWpm: number;
  /** [correct, incorrect, extra, missed]. chars sent is the correct count. */
  charStats?: readonly [number, number, number, number];
  /** test length in seconds, the same duration wpm was calculated from */
  testDuration?: number;
}): Omit<ScoreSubmission, "showOnLeaderboard" | "sessionToken"> | undefined {
  const mode2 = leaderboardMode2(result.mode, result.mode2);
  if (mode2 === undefined) return undefined;
  if (result.mode !== "time" && result.mode !== "words") return undefined;
  const language = result.language ?? "";
  if (!/^[a-z0-9_]{1,64}$/.test(language)) return undefined;
  const chars = wholeCount(result.charStats?.[0]);
  const durationMs =
    result.testDuration === undefined
      ? undefined
      : Math.round(result.testDuration * 1000);
  if (
    chars === undefined ||
    chars < 1 ||
    durationMs === undefined ||
    !Number.isInteger(durationMs) ||
    durationMs < 1
  ) {
    return undefined;
  }
  return {
    mode: result.mode,
    mode2,
    language,
    punctuation: result.punctuation === true,
    numbers: result.numbers === true,
    wpm: result.wpm,
    acc: result.acc,
    raw: result.rawWpm,
    chars,
    durationMs,
  };
}

export async function postLeaderboardScore(
  base: string,
  submission: ScoreSubmission,
  fetchImpl: typeof fetch = fetch,
): Promise<LeaderboardErr | { ok: true }> {
  try {
    const response = await fetchImpl(
      new URL("/leaderboards", `${base}/`).toString(),
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(submission),
      },
    );
    const text = await response.text();
    if (text === "") {
      return response.ok
        ? { ok: true }
        : { ok: false, error: "Couldn't submit your score." };
    }
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      return response.ok
        ? { ok: true }
        : { ok: false, error: "Couldn't submit your score." };
    }
    const err = ErrSchema.safeParse(json);
    if (err.success) return { ok: false, error: err.data.error };
    if (!response.ok) {
      return { ok: false, error: "Couldn't submit your score." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't submit your score." };
  }
}

export function currentLeaderboardBase(): string {
  return leaderboardHttpBase(window.location, CONFIGURED_WS_URL);
}
