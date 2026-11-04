import { describe, expect, it } from "vitest";

import {
  AGE_BLOCK_KEY,
  birthYearOptions,
  blockAge,
  isAgeBlocked,
  isAgeOk,
} from "../../src/ts/accounts/age";

const now = new Date("2026-11-04T12:00:00Z");

describe("accounts age gate", () => {
  it("lists every year from this one back, newest first, nothing skipped", () => {
    const years = birthYearOptions(now);
    expect(years[0]).toBe(2026);
    expect(years).toHaveLength(101);
    expect(years.at(-1)).toBe(1926);
    years.forEach((y, i) => expect(y).toBe(2026 - i));
  });

  it("13+ whatever the birthday: born 13 years ago is not enough", () => {
    expect(isAgeOk(2012, now)).toBe(true);
    expect(isAgeOk(2013, now)).toBe(false);
    expect(isAgeOk(2026, now)).toBe(false);
    expect(isAgeOk(1926, now)).toBe(true);
    expect(isAgeOk(Number.NaN, now)).toBe(false);
  });

  it("an under-13 answer blocks retries via storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string): string | null => store.get(k) ?? null,
      setItem: (k: string, v: string): void => void store.set(k, v),
    };
    expect(isAgeBlocked(storage)).toBe(false);
    blockAge(storage);
    expect(isAgeBlocked(storage)).toBe(true);
    // the flag is all that's kept: no year, no date
    expect([...store.entries()]).toEqual([[AGE_BLOCK_KEY, "1"]]);
  });
});
