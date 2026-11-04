import { describe, expect, it } from "vitest";

import {
  AGE_BLOCK_KEY,
  AGE_BLOCK_MS,
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

  const DAY = 24 * 60 * 60 * 1000;
  const memoryStorage = (): Pick<
    Storage,
    "getItem" | "setItem" | "removeItem"
  > & { store: Map<string, string> } => {
    const store = new Map<string, string>();
    return {
      store,
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
  };
  const t0 = now.getTime();

  it("an under-13 answer blocks retries via storage", () => {
    const storage = memoryStorage();
    expect(isAgeBlocked(storage, t0)).toBe(false);
    blockAge(storage, t0);
    expect(isAgeBlocked(storage, t0)).toBe(true);
    // the flag and when it was set are all that's kept: no year
    expect([...storage.store.entries()]).toEqual([
      [AGE_BLOCK_KEY, JSON.stringify({ v: "1", t: t0 })],
    ]);
  });

  it("the block lasts 365 days, then is cleared", () => {
    expect(AGE_BLOCK_MS).toBe(365 * DAY);
    const storage = memoryStorage();
    blockAge(storage, t0);
    expect(isAgeBlocked(storage, t0 + 364 * DAY)).toBe(true);
    expect(isAgeBlocked(storage, t0 + 365 * DAY - 1)).toBe(true);
    expect(isAgeBlocked(storage, t0 + 365 * DAY)).toBe(false);
    expect(storage.store.size).toBe(0);

    blockAge(storage, t0);
    expect(isAgeBlocked(storage, t0 + 366 * DAY)).toBe(false);
    expect(storage.store.size).toBe(0);
  });

  it("a clock moved back keeps the block, but not by a year or more", () => {
    const storage = memoryStorage();
    blockAge(storage, t0);
    expect(isAgeBlocked(storage, t0 - 364 * DAY)).toBe(true);
    expect(isAgeBlocked(storage, t0 - 366 * DAY)).toBe(false);
    expect(storage.store.size).toBe(0);
  });

  it.each([
    ["the old bare flag", "1"],
    ["empty", ""],
    ["not JSON", "{v:1"],
    ["null", "null"],
    ["an array", JSON.stringify(["1", t0])],
    ["a number v", JSON.stringify({ v: 1, t: t0 })],
    ["another v", JSON.stringify({ v: "0", t: t0 })],
    ["no t", JSON.stringify({ v: "1" })],
    ["a string t", JSON.stringify({ v: "1", t: String(t0) })],
    ["a fractional t", JSON.stringify({ v: "1", t: t0 + 0.5 })],
    ["an extra key", JSON.stringify({ v: "1", t: t0, year: 2020 })],
  ])("malformed (%s): cleared, not blocked", (_, raw) => {
    const storage = memoryStorage();
    storage.setItem(AGE_BLOCK_KEY, raw);
    expect(isAgeBlocked(storage, t0)).toBe(false);
    expect(storage.store.size).toBe(0);
  });

  it("leaves other keys alone", () => {
    const storage = memoryStorage();
    storage.setItem("other", "x");
    storage.setItem(AGE_BLOCK_KEY, "junk");
    isAgeBlocked(storage, t0);
    expect([...storage.store.keys()]).toEqual(["other"]);
  });
});
