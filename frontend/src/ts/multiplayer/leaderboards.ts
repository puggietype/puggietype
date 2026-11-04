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
  mode: LeaderboardMode;
  mode2: number;
  accuracyFloor: number;
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
  mode: z.enum(["time", "words"]),
  mode2: z.number(),
  accuracyFloor: z.number(),
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

/** fields added to race:finish. kidsGuide is how the server rejects a kids score. */
export function finishLeaderboardFields(options: {
  show: boolean;
  kids: boolean;
  leaderboards: boolean;
}): { showOnLeaderboard?: boolean; kidsGuide?: true } {
  return {
    ...(options.kids ? { kidsGuide: true as const } : {}),
    ...(options.leaderboards
      ? { showOnLeaderboard: options.kids ? false : options.show }
      : {}),
  };
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
    mode: ok.data.mode,
    mode2: ok.data.mode2,
    accuracyFloor: ok.data.accuracyFloor,
    entries: ok.data.entries,
  };
}

export async function fetchLeaderboard(
  base: string,
  query: LeaderboardQuery,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<LeaderboardResult> {
  try {
    const response = await fetchImpl(leaderboardUrl(base, query), {
      method: "GET",
      headers: { accept: "application/json" },
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

export function scoreFromResult(result: {
  mode: string;
  mode2: string | number;
  language?: string;
  punctuation?: boolean;
  numbers?: boolean;
  wpm: number;
  acc: number;
  rawWpm: number;
}): Omit<ScoreSubmission, "showOnLeaderboard" | "sessionToken"> | undefined {
  const mode2 = leaderboardMode2(result.mode, result.mode2);
  if (mode2 === undefined) return undefined;
  if (result.mode !== "time" && result.mode !== "words") return undefined;
  const language = result.language ?? "";
  if (!/^[a-z0-9_]{1,64}$/.test(language)) return undefined;
  return {
    mode: result.mode,
    mode2,
    language,
    punctuation: result.punctuation === true,
    numbers: result.numbers === true,
    wpm: result.wpm,
    acc: result.acc,
    raw: result.rawWpm,
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
