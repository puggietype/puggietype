/**
 * Random per-browser id, used only so Quick Match never matches you against your own other tab.
 * Sent only in `queue:join`; not tied to your name or account.
 */

const STORAGE_KEY = "puggie-mp-client-id";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** fallback when localStorage is unavailable (privacy mode): one id per page load */
let memoryId: string | undefined;

function randomUuidV4(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isValidClientId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

/** this browser's Quick Match client id, created on first use */
export function getClientId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isValidClientId(stored)) {
      return stored;
    }
    const id = randomUuidV4();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    memoryId ??= randomUuidV4();
    return memoryId;
  }
}

/** the stored id, without minting one */
export function readStoredClientId(): string | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isValidClientId(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

/** IndexedDB copy of the id, only used to agree on one id across tabs (QM-009) */
const DB_NAME = STORAGE_KEY;
const DB_STORE = "id";
const DB_RECORD = "current";
/** a coordination record older than this is ignored and replaced */
const DB_RECORD_TTL_MS = 60_000;
/** give up on IndexedDB and fall back to localStorage after this long */
const DB_TIMEOUT_MS = 1_000;

type IdRecord = { id: string; at: number };

let pending: Promise<string> | undefined;

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onblocked = () => reject(new Error("indexedDB open blocked"));
  });
}

/**
 * Get-or-create in one readwrite transaction. IndexedDB never runs two
 * readwrite transactions on the same store at once, even across tabs, and a
 * committed write is visible to the next one, unlike localStorage which other
 * tabs may see late (QM-009). The id is mirrored to localStorage after commit.
 */
async function getOrCreateInDb(): Promise<string> {
  const db = await openDb();
  try {
    return await new Promise<string>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      let id: string | undefined;
      const get = store.get(DB_RECORD);
      get.onsuccess = () => {
        const record = get.result as Partial<IdRecord> | undefined;
        const now = Date.now();
        const age = now - (record?.at ?? Number.NaN);
        if (isValidClientId(record?.id) && age >= 0 && age < DB_RECORD_TTL_MS) {
          id = record.id;
          return;
        }
        // stale or malformed: remove it in this same transaction, then write
        // the fresh record, so no expired copy is left behind
        if (record !== undefined) store.delete(DB_RECORD);
        id = readStoredClientId() ?? randomUuidV4();
        store.put({ id, at: now } satisfies IdRecord, DB_RECORD);
      };
      tx.oncomplete = () => {
        if (id === undefined) {
          reject(new Error("no client id"));
          return;
        }
        try {
          localStorage.setItem(STORAGE_KEY, id);
        } catch {
          memoryId = id;
        }
        resolve(id);
      };
      tx.onerror = () => reject(tx.error ?? new Error("transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
    });
  } finally {
    db.close();
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Fallback when IndexedDB is missing, fails or hangs: the localStorage
 * read-or-mint, serialised across tabs with a Web Lock so a second tab
 * re-reads the first tab's id instead of minting its own (QM-009). Without
 * navigator.locks (or if it fails) it is the plain `getClientId()`.
 */
async function lockedReadOrMint(): Promise<string> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (typeof locks?.request !== "function") return getClientId();
  try {
    return await locks.request(STORAGE_KEY, async () => {
      // re-read inside the lock: another tab may have just stored one
      return readStoredClientId() ?? getClientId();
    });
  } catch {
    return getClientId();
  }
}

/**
 * Call ONLY from the find-match click path (RaceHome findMatch → joinQueue),
 * never at app start, in connect() or onMount (Legal condition, QM-009;
 * enforced by client-id-callers.spec.ts).
 *
 * This browser's Quick Match client id, agreed across tabs: when several
 * fresh tabs click find match together they all resolve to the same id
 * (QM-009). Resolves at once when an id is already stored. Without IndexedDB
 * (or if it fails or is slow) falls back to `lockedReadOrMint()`.
 */
export async function acquireClientId(): Promise<string> {
  const stored = readStoredClientId();
  if (stored !== undefined) return stored;
  pending ??= (async () => {
    try {
      if (typeof indexedDB === "undefined") return await lockedReadOrMint();
      return await withTimeout(getOrCreateInDb(), DB_TIMEOUT_MS);
    } catch {
      return lockedReadOrMint();
    }
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}

/** test-only: forget the in-memory fallback id */
export function __resetClientIdForTests(): void {
  memoryId = undefined;
  pending = undefined;
}
