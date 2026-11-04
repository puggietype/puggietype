// Neutral 13+ age gate (plan section 2, Legal item 1). The birth year only
// ever lives in the form: callers keep the boolean result and drop the year.

/**
 * localStorage key set to "1" after an under-13 answer; blocks retries in
 * every tab and after restarts. Never expires (Legal wants 30+ days), and
 * holds nothing else: no year, no date, nothing identifying.
 */
export const AGE_BLOCK_KEY = "ptAccountsAgeBlock";

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

export function isAgeBlocked(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(AGE_BLOCK_KEY) === "1";
}

export function blockAge(storage: Pick<Storage, "setItem">): void {
  storage.setItem(AGE_BLOCK_KEY, "1");
}
