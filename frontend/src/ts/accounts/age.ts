// Neutral 13+ age gate (plan section 2, Legal item 1). The birth year only
// ever lives in the form: callers keep the boolean result and drop the year.

/**
 * localStorage key set after an under-13 answer; blocks retries in every tab
 * and after restarts, for AGE_BLOCK_MS. The value is `{"v":"1","t":<ms>}`,
 * `t` being when the block was set: no year, nothing identifying.
 */
export const AGE_BLOCK_KEY = "ptAccountsAgeBlock";

/** how long an under-13 answer blocks the device (Legal wants 30+ days) */
export const AGE_BLOCK_MS = 365 * 24 * 60 * 60 * 1000;

const MIN_AGE = 13;
// wide enough that the list itself says nothing about the cutoff
const YEARS_SHOWN = 100;

/** newest first, from this year back; no year is marked or left out */
export function birthYearOptions(now: Date): number[] {
  const current = now.getFullYear();
  return Array.from({ length: YEARS_SHOWN + 1 }, (_, i) => current - i);
}

/**
 * True only if the person is 13 or older whatever their birthday: with just
 * a year, someone born 13 years ago may still be 12, so that year fails.
 */
export function isAgeOk(birthYear: number, now: Date): boolean {
  if (!Number.isInteger(birthYear)) return false;
  return now.getFullYear() - birthYear - 1 >= MIN_AGE;
}

/** the block's start time, or undefined unless the value is exactly ours */
function blockedAt(raw: string): number | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  if (Object.keys(value).sort().join() !== "t,v") return undefined;
  const { v, t } = value as { v: unknown; t: unknown };
  return v === "1" && Number.isSafeInteger(t) ? (t as number) : undefined;
}

/**
 * Blocked for AGE_BLOCK_MS after blockAge. An expired or malformed value is
 * removed and doesn't block. A start time ahead of the clock (it was moved
 * back) still blocks, unless it's a whole block length ahead.
 */
export function isAgeBlocked(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): boolean {
  const raw = storage.getItem(AGE_BLOCK_KEY);
  if (raw === null) return false;
  const t = blockedAt(raw);
  if (t !== undefined && Math.abs(now - t) < AGE_BLOCK_MS) return true;
  storage.removeItem(AGE_BLOCK_KEY);
  return false;
}

export function blockAge(
  storage: Pick<Storage, "setItem">,
  now = Date.now(),
): void {
  storage.setItem(AGE_BLOCK_KEY, JSON.stringify({ v: "1", t: now }));
}
