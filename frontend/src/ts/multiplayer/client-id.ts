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

/** test-only: forget the in-memory fallback id */
export function __resetClientIdForTests(): void {
  memoryId = undefined;
}
