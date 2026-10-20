import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetClientIdForTests,
  acquireClientId,
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

/**
 * Minimal IndexedDB fake: one shared backing map ("same origin"), readwrite
 * transactions run one at a time in request order like real IndexedDB.
 */
function fakeIndexedDB(backing = new Map<string, unknown>()): {
  factory: IDBFactory;
  backing: Map<string, unknown>;
  maxActive: () => number;
  log: string[];
} {
  const log: string[] = [];
  let txCount = 0;
  let tail: Promise<void> = Promise.resolve();
  let active = 0;
  let max = 0;
  const later = (fn: () => void): void => {
    setTimeout(fn, 0);
  };
  const db = {
    transaction: () => {
      const txId = ++txCount;
      const tx: Record<string, unknown> & {
        oncomplete?: () => void;
        objectStore: () => unknown;
      } = {
        error: null,
        objectStore: () => ({
          get: (key: string) => {
            const req: { result?: unknown; onsuccess?: () => void } = {};
            ops.push(() => {
              log.push(`tx${txId}:get`);
              req.result = structuredClone(backing.get(key));
              req.onsuccess?.();
            });
            return req;
          },
          put: (value: unknown, key: string) => {
            ops.push(() => {
              log.push(`tx${txId}:put`);
              backing.set(key, structuredClone(value));
            });
            return {};
          },
          delete: (key: string) => {
            ops.push(() => {
              log.push(`tx${txId}:delete`);
              backing.delete(key);
            });
            return {};
          },
        }),
      };
      const ops: (() => void)[] = [];
      tail = tail.then(
        async () =>
          new Promise<void>((done) => {
            later(() => {
              active++;
              max = Math.max(max, active);
              while (ops.length > 0) ops.shift()?.();
              active--;
              done();
              tx.oncomplete?.();
            });
          }),
      );
      return tx;
    },
    close: () => undefined,
  };
  const factory = {
    open: () => {
      const req: {
        result?: unknown;
        onupgradeneeded?: () => void;
        onsuccess?: () => void;
      } = {};
      later(() => {
        req.result = { ...db, createObjectStore: () => undefined };
        req.onsuccess?.();
      });
      return req;
    },
  } as unknown as IDBFactory;
  return { factory, backing, maxActive: () => max, log };
}

/**
 * localStorage shared by tabs whose writes become visible only later, like
 * cross-process localStorage in real browsers (the QM-009 bug)
 */
function laggyStorage(lagMs = 50): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      setTimeout(() => m.set(k, v), lagMs);
    },
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

type ClientIdModule = typeof import("../../src/ts/multiplayer/client-id");

/** a fresh module instance, like a new tab */
async function openTab(): Promise<ClientIdModule> {
  vi.resetModules();
  return import("../../src/ts/multiplayer/client-id");
}

describe("acquireClientId (QM-009)", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetClientIdForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("returns a stored id at once without touching IndexedDB", async () => {
    const stored = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    localStorage.setItem(KEY, stored);
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    expect(await acquireClientId()).toBe(stored);
    expect(open).not.toHaveBeenCalled();
  });

  it("mints, stores in localStorage and IndexedDB on first use", async () => {
    const idb = fakeIndexedDB();
    vi.stubGlobal("indexedDB", idb.factory);
    const id = await acquireClientId();
    expect(id).toMatch(UUID_V4);
    expect(localStorage.getItem(KEY)).toBe(id);
    expect(idb.backing.get("current")).toMatchObject({ id });
  });

  it("two fresh tabs clicking together agree on one id despite localStorage lag", async () => {
    const idb = fakeIndexedDB();
    vi.stubGlobal("indexedDB", idb.factory);
    vi.stubGlobal("localStorage", laggyStorage());
    const [tab1, tab2] = [await openTab(), await openTab()];
    const [a, b] = await Promise.all([
      tab1.acquireClientId(),
      tab2.acquireClientId(),
    ]);
    expect(a).toMatch(UUID_V4);
    expect(b).toBe(a);
    expect(idb.maxActive()).toBe(1);
  });

  it("localStorage alone diverges under that lag (control)", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("localStorage", laggyStorage());
    const [tab1, tab2] = [await openTab(), await openTab()];
    const [a, b] = await Promise.all([
      tab1.acquireClientId(),
      tab2.acquireClientId(),
    ]);
    expect(b).not.toBe(a);
  });

  it("a staggered second tab adopts the first tab's id", async () => {
    vi.stubGlobal("indexedDB", fakeIndexedDB().factory);
    vi.stubGlobal("localStorage", laggyStorage(10_000));
    const a = await (await openTab()).acquireClientId();
    const b = await (await openTab()).acquireClientId();
    expect(b).toBe(a);
  });

  it("concurrent calls in one tab share one result", async () => {
    vi.stubGlobal("indexedDB", fakeIndexedDB().factory);
    const [a, b] = await Promise.all([acquireClientId(), acquireClientId()]);
    expect(b).toBe(a);
  });

  it("ignores a stale IndexedDB record and mints a new id", async () => {
    const old = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";
    const idb = fakeIndexedDB(
      new Map([["current", { id: old, at: Date.now() - 61_000 }]]),
    );
    vi.stubGlobal("indexedDB", idb.factory);
    const id = await acquireClientId();
    expect(id).toMatch(UUID_V4);
    expect(id).not.toBe(old);
    expect(idb.backing.get("current")).toMatchObject({ id });
  });

  it("deletes and replaces a stale record inside the same transaction", async () => {
    const old = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const idb = fakeIndexedDB(
      new Map([["current", { id: old, at: Date.now() - 60_000 }]]),
    );
    vi.stubGlobal("indexedDB", idb.factory);
    const id = await acquireClientId();
    expect(id).not.toBe(old);
    expect(idb.log).toEqual(["tx1:get", "tx1:delete", "tx1:put"]);
    expect(idb.backing.size).toBe(1);
    const rec = idb.backing.get("current") as { id: string; at: number };
    expect(rec.id).toBe(id);
    expect(Date.now() - rec.at).toBeLessThan(60_000);
  });

  it("deletes and replaces a malformed record inside the same transaction", async () => {
    const idb = fakeIndexedDB(new Map([["current", { id: "nope", at: 0 }]]));
    vi.stubGlobal("indexedDB", idb.factory);
    const id = await acquireClientId();
    expect(id).toMatch(UUID_V4);
    expect(idb.log).toEqual(["tx1:get", "tx1:delete", "tx1:put"]);
    expect(idb.backing.get("current")).toMatchObject({ id });
  });

  it("adopts a fresh record without deleting or rewriting it", async () => {
    const cur = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const idb = fakeIndexedDB(
      new Map([["current", { id: cur, at: Date.now() - 1_000 }]]),
    );
    vi.stubGlobal("indexedDB", idb.factory);
    expect(await acquireClientId()).toBe(cur);
    expect(idb.log).toEqual(["tx1:get"]);
  });

  it("falls back to localStorage without IndexedDB", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const id = await acquireClientId();
    expect(id).toMatch(UUID_V4);
    expect(localStorage.getItem(KEY)).toBe(id);
  });

  it("falls back to localStorage when IndexedDB fails to open", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        const req: { error: Error; onerror?: () => void } = {
          error: new Error("InvalidStateError"),
        };
        setTimeout(() => req.onerror?.(), 0);
        return req;
      },
    });
    const id = await acquireClientId();
    expect(id).toMatch(UUID_V4);
    expect(localStorage.getItem(KEY)).toBe(id);
  });

  it("falls back after a timeout when IndexedDB hangs", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("indexedDB", { open: () => ({}) });
      const p = acquireClientId();
      await vi.advanceTimersByTimeAsync(1_000);
      const id = await p;
      expect(id).toMatch(UUID_V4);
      expect(localStorage.getItem(KEY)).toBe(id);
    } finally {
      vi.useRealTimers();
    }
  });
});
