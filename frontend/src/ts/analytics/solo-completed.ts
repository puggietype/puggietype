// Anonymous first-party solo-completion counter. Body is exactly
// { mode, length } from fixed allowlists. Legal ruling 2026-11-24: send on
// accept or no choice yet, never after reject, never on kids paths or in a
// kids-flow tab, never from Steam, MP or ghost races.
import { CONFIGURED_WS_URL } from "../multiplayer/flags";
import { leaderboardHttpBase } from "../multiplayer/leaderboards";
import { noteKidsFlowVisit, readConsentRecord } from "./consent";

export const SOLO_COMPLETED_PATH = "/solo-completed";

const MODES = ["time", "words", "quote", "zen", "custom"] as const;
const TIME_LENGTHS = ["15", "30", "60", "120"];
const WORDS_LENGTHS = ["10", "25", "50", "100"];
const QUOTE_LENGTHS = ["short", "medium", "long", "thicc"] as const;

export type SoloMode = (typeof MODES)[number] | "other";
export type SoloLength =
  | "15"
  | "30"
  | "60"
  | "120"
  | "10"
  | "25"
  | "50"
  | "100"
  | (typeof QUOTE_LENGTHS)[number]
  | "custom"
  | "other";

export type SoloCompletedBody = { mode: SoloMode; length: SoloLength };

function isSteam(): boolean {
  return typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam";
}

/** Allowlist only. Anything unknown is "other"; never free text. */
export function soloCompletedBody(input: {
  mode: string;
  mode2: string;
  quoteGroup?: number;
}): SoloCompletedBody {
  const mode = (MODES as readonly string[]).includes(input.mode)
    ? (input.mode as SoloMode)
    : "other";
  if (mode === "time") {
    return {
      mode,
      length: TIME_LENGTHS.includes(input.mode2)
        ? (input.mode2 as SoloLength)
        : "other",
    };
  }
  if (mode === "words") {
    return {
      mode,
      length: WORDS_LENGTHS.includes(input.mode2)
        ? (input.mode2 as SoloLength)
        : "other",
    };
  }
  if (mode === "quote") {
    const group = input.quoteGroup;
    const length =
      typeof group === "number" && Number.isInteger(group)
        ? QUOTE_LENGTHS[group]
        : undefined;
    return { mode, length: length ?? "other" };
  }
  if (mode === "zen" || mode === "custom") return { mode, length: "custom" };
  return { mode, length: "other" };
}

/** Accepted or undecided. Reject (incl. in-session withdrawal) never sends. */
export function soloCounterConsentAllows(analytics: boolean | null): boolean {
  return analytics !== false;
}

export type SoloCompletedInput = {
  mode: string;
  mode2: string;
  quoteGroup?: number;
  /** fail checks passed (snapshot before the logged-out dontSave) */
  valid: boolean;
  bailedOut: boolean;
  ghostApplicable: boolean;
};

/** Fire and forget. At most one POST, no retry, never throws. */
export function sendSoloCompleted(input: SoloCompletedInput): void {
  try {
    if (!input.valid || input.bailedOut || input.ghostApplicable) return;
    if (isSteam()) return;
    const kids = noteKidsFlowVisit({
      pathname: window.location.pathname,
      referrer: document.referrer,
      storage: sessionStorage,
    });
    if (kids) return;
    if (!soloCounterConsentAllows(readConsentRecord()?.analytics ?? null)) {
      return;
    }
    const base = leaderboardHttpBase(window.location, CONFIGURED_WS_URL);
    const url = new URL(SOLO_COMPLETED_PATH, `${base.replace(/\/$/, "")}/`);
    const body = soloCompletedBody(input);
    void fetch(url.toString(), {
      method: "POST",
      body: JSON.stringify({ mode: body.mode, length: body.length }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // counting is best effort; never break the result screen
  }
}
