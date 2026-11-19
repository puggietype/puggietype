// Personal bests for the accounts API: one POST after a finished test that
// counts under standard rules. Only reached through import() from
// test-logic.ts (VITE_FEATURE_ACCOUNTS) while signed in.
import { getPbEligibility } from "../test/result-pb";
import { CompletedResult } from "../states/test";
import { PersonalBestSubmission, submitPersonalBest } from "./api";
import { callWithIdToken } from "./authed-call";
import { getAccountUser, setPersonalBestsVersion } from "./state";

/** the server refuses anything outside these (POST /v1/me/personal-bests) */
export const PB_LIMITS = {
  maxWpm: 350,
  maxRawWpm: 400,
  maxDurationS: 3600,
} as const;

export type PbCandidate =
  | { ok: true; personalBest: PersonalBestSubmission }
  | { ok: false; reason: string };

let inFlight = false;

/**
 * The submission for a finished, saved result, or why it doesn't count:
 * PB-eligible (getPbEligibility), no funbox, normal difficulty, no lazy
 * mode, not bailed out, time or words, inside the server's limits.
 */
export function toPersonalBest(result: CompletedResult): PbCandidate {
  const eligibility = getPbEligibility(result, false);
  if (eligibility === null) return { ok: false, reason: "mode" };
  if (!eligibility.value) {
    return { ok: false, reason: eligibility.reason ?? "ineligible" };
  }
  if (result.mode !== "time" && result.mode !== "words") {
    return { ok: false, reason: "mode" };
  }
  if (result.funbox.length > 0) return { ok: false, reason: "funbox" };
  if (result.difficulty !== "normal") {
    return { ok: false, reason: "difficulty" };
  }
  if (result.lazyMode) return { ok: false, reason: "lazy mode" };
  if (result.bailedOut) return { ok: false, reason: "bailed out" };

  const { wpm, rawWpm, acc, testDuration: durationS } = result;
  const inLimits =
    [wpm, rawWpm, acc, durationS].every(Number.isFinite) &&
    wpm > 0 &&
    wpm <= PB_LIMITS.maxWpm &&
    rawWpm >= wpm &&
    rawWpm <= PB_LIMITS.maxRawWpm &&
    acc >= 0 &&
    acc <= 100 &&
    durationS > 0 &&
    durationS <= PB_LIMITS.maxDurationS;
  if (!inLimits) return { ok: false, reason: "limits" };

  return {
    ok: true,
    personalBest: {
      mode: result.mode,
      mode2: result.mode2,
      language: result.language,
      punctuation: result.punctuation,
      numbers: result.numbers,
      wpm,
      rawWpm,
      acc,
      consistency: Number.isFinite(result.consistency)
        ? result.consistency
        : null,
      durationS,
    },
  };
}

/**
 * test-logic.ts, after a saved result: fire and forget. Never throws, never
 * retries; a result finished while one is still being sent is dropped.
 */
export async function submitIfPersonalBest(
  result: CompletedResult,
): Promise<void> {
  if (inFlight || getAccountUser() === null) return;
  inFlight = true;
  try {
    const candidate = toPersonalBest(result);
    if (!candidate.ok) return;
    const submitted = await callWithIdToken(async (options) =>
      submitPersonalBest({ ...options, personalBest: candidate.personalBest }),
    );
    if (submitted.ok && submitted.isNew) {
      setPersonalBestsVersion((v) => v + 1);
    }
  } catch {
    // a personal best is never worth an error on the result screen
  } finally {
    inFlight = false;
  }
}
