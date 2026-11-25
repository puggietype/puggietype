import { LanguageSchema } from "@monkeytype/schemas/languages";

import { emitConsentedEvent } from "./ga4";

/**
 * Solo `test_completed` helpers live here, not in ga4.ts, so static pages
 * that boot analytics do not download the language enum.
 */

const TEST_COMPLETED_MODES = [
  "time",
  "words",
  "quote",
  "zen",
  "custom",
] as const;
type TestCompletedMode = (typeof TEST_COMPLETED_MODES)[number];
const QUOTE_LENGTH_GROUPS = ["short", "medium", "long", "thicc"] as const;
const WPM_BUCKETS = [
  "0-19",
  "20-39",
  "40-59",
  "60-79",
  "80-99",
  "100-119",
  "120-139",
] as const;

/** Only the result fields `test_completed` reads. */
export type TestCompletedInput = {
  mode: string;
  mode2: string;
  quoteLength?: number;
  wpm: number;
  language?: string;
  bailedOut?: boolean;
};

export type TestCompletedParams = {
  test_mode: TestCompletedMode;
  test_length: string;
  wpm_bucket: string;
  /** Not `language`: GA4 treats that name as reserved and drops it from /g/collect. */
  test_language?: string;
};

function isTestCompletedMode(mode: string): mode is TestCompletedMode {
  return (TEST_COMPLETED_MODES as readonly string[]).includes(mode);
}

/** Floored WPM in 20 wide buckets, `140+` on top. Null when not a finite number >= 0. */
export function wpmBucket(wpm: number): string | null {
  if (!Number.isFinite(wpm) || wpm < 0) return null;
  return WPM_BUCKETS[Math.floor(Math.floor(wpm) / 20)] ?? "140+";
}

/**
 * Digits for time and words (1 to 99999), the group name for quote,
 * `custom` for everything else. Never a raw negative group or free text.
 */
export function testLengthParam(
  mode: TestCompletedMode,
  mode2: string,
  quoteLength: number | undefined,
): string {
  if (mode === "time" || mode === "words") {
    return /^[1-9][0-9]{0,4}$/.test(mode2) ? mode2 : "custom";
  }
  if (mode === "quote" && quoteLength !== undefined) {
    return QUOTE_LENGTH_GROUPS[quoteLength] ?? "custom";
  }
  return "custom";
}

/** Fixed values only. Null when the mode or WPM cannot be bucketed. */
export function testCompletedParams(
  result: TestCompletedInput,
): TestCompletedParams | null {
  if (!isTestCompletedMode(result.mode)) return null;
  const bucket = wpmBucket(result.wpm);
  if (bucket === null) return null;
  const params: TestCompletedParams = {
    test_mode: result.mode,
    test_length: testLengthParam(result.mode, result.mode2, result.quoteLength),
    wpm_bucket: bucket,
  };
  const language = LanguageSchema.safeParse(result.language);
  if (language.success) params.test_language = language.data;
  return params;
}

/** A valid, non bailed out solo result. Failed or aborted tests are not completions. */
export function shouldReportTestCompleted(
  result: Pick<TestCompletedInput, "bailedOut">,
  valid: boolean,
): boolean {
  return valid && result.bailedOut !== true;
}

/**
 * One `test_completed` per finished solo test. Same gate as route page_views:
 * nothing while the opt-out flag is set, analytics is off, or on kids paths,
 * kids-flow, or Steam. Never throws, so a finished test always shows its result.
 */
export function sendTestCompleted(
  result: TestCompletedInput,
  valid: boolean,
): void {
  try {
    if (!shouldReportTestCompleted(result, valid)) return;
    const params = testCompletedParams(result);
    if (params === null) return;
    emitConsentedEvent("test_completed", params);
  } catch {
    // analytics must never break the result screen
  }
}
