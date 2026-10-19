import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearFull,
  DEFAULT_RETRY_MS,
  enterFull,
  FULL_CLOSE_CODES,
  retryDelay,
  retryFullNow,
  RETRY_JITTER_MS,
  secondsLeft,
  serverFull,
} from "../../src/ts/multiplayer/capacity";

describe("retryDelay", () => {
  it("uses the server's hint plus jitter", () => {
    expect(retryDelay(30_000, () => 0)).toBe(30_000);
    expect(retryDelay(30_000, () => 0.5)).toBe(30_000 + RETRY_JITTER_MS / 2);
  });

  it("defaults to 60 s for a missing or junk hint", () => {
    expect(retryDelay(undefined, () => 0)).toBe(DEFAULT_RETRY_MS);
    expect(retryDelay(Number.NaN, () => 0)).toBe(DEFAULT_RETRY_MS);
  });

  it("clamps silly hints", () => {
    expect(retryDelay(0, () => 0)).toBe(1_000);
    expect(retryDelay(1e12, () => 0)).toBe(600_000);
  });
});

describe("secondsLeft", () => {
  it("rounds up and never goes negative", () => {
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(70_000, 10_000)).toBe(60);
    expect(secondsLeft(9_000, 10_000)).toBe(0);
  });
});

it("knows the full close codes", () => {
  expect(FULL_CLOSE_CODES.has(4503)).toBe(true);
  expect(FULL_CLOSE_CODES.has(4002)).toBe(true);
  expect(FULL_CLOSE_CODES.has(1006)).toBe(false);
});

describe("full state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    clearFull();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("counts down, then retries once", () => {
    const retry = vi.fn();
    enterFull("socket", 3_000, retry);
    expect(serverFull()).toEqual({
      scope: "socket",
      retryAt: Date.now() + 3_000,
      retrying: false,
    });
    vi.advanceTimersByTime(2_999);
    expect(retry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(serverFull()?.retrying).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("try now skips the wait", () => {
    const retry = vi.fn();
    enterFull("room", 30_000, retry);
    retryFullNow();
    expect(retry).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("clearFull stops the timer", () => {
    const retry = vi.fn();
    enterFull("room", 1_000, retry);
    clearFull();
    expect(serverFull()).toBeUndefined();
    vi.advanceTimersByTime(5_000);
    retryFullNow();
    expect(retry).not.toHaveBeenCalled();
  });
});
