import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetClientIdForTests,
  getClientId,
  readStoredClientId,
} from "../../src/ts/multiplayer/client-id";

const KEY = "puggie-mp-client-id";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("getClientId", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetClientIdForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("generates a valid v4 UUID and stores it", () => {
    const id = getClientId();
    expect(id).toMatch(UUID_V4);
    expect(localStorage.getItem(KEY)).toBe(id);
  });

  it("reuses the stored id across calls and tabs sharing localStorage", () => {
    const first = getClientId();
    expect(getClientId()).toBe(first);
    // another tab: fresh module state, same storage
    __resetClientIdForTests();
    expect(getClientId()).toBe(first);
  });

  it("replaces a malformed stored value", () => {
    for (const bad of [
      "",
      "not-a-uuid",
      "123e4567-e89b-12d3-a456-426614174000", // v1, not v4
      "123e4567-e89b-42d3-c456-426614174000", // bad variant
    ]) {
      localStorage.setItem(KEY, bad);
      const id = getClientId();
      expect(id).toMatch(UUID_V4);
      expect(id).not.toBe(bad);
      expect(localStorage.getItem(KEY)).toBe(id);
    }
  });

  it("falls back to crypto.getRandomValues without randomUUID", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      const ids = new Set(
        Array.from({ length: 20 }, () => {
          localStorage.clear();
          return getClientId();
        }),
      );
      for (const id of ids) {
        expect(id).toMatch(UUID_V4);
      }
      expect(ids.size).toBe(20);
    } finally {
      Object.defineProperty(crypto, "randomUUID", {
        value: original,
        configurable: true,
        writable: true,
      });
    }
  });

  it("keeps a per-page-load id in memory when localStorage throws", () => {
    const fail = (): never => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail });
    const id = getClientId();
    expect(id).toMatch(UUID_V4);
    expect(getClientId()).toBe(id);
    // new page load gets a new id
    __resetClientIdForTests();
    expect(getClientId()).not.toBe(id);
  });
});

describe("readStoredClientId", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetClientIdForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("never mints: no key exists before a click", () => {
    expect(readStoredClientId()).toBeUndefined();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("returns the last valid value written by any tab", () => {
    getClientId();
    const later = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";
    localStorage.setItem(KEY, later);
    expect(readStoredClientId()).toBe(later);
  });

  it("ignores malformed values and storage errors", () => {
    localStorage.setItem(KEY, "123e4567-e89b-12d3-a456-426614174000");
    expect(readStoredClientId()).toBeUndefined();
    vi.stubGlobal("localStorage", {
      getItem: (): never => {
        throw new Error("SecurityError");
      },
    });
    expect(readStoredClientId()).toBeUndefined();
  });
});
