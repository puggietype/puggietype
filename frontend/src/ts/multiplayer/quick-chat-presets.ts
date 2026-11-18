// Mirror of puggietype-server src/quickChatPresets.ts (PR #17, main bc0e5fd). Keep the ids and limits identical on both sides; Legal reviews the id list.
/**
 * Quick-chat: the ONE place that lists what a player may send, and how fast.
 *
 * Players never type. The wire carries a preset id; the server accepts only the ids below and
 * relays only an id it built from this list. Display text and icons live in the client, never on
 * the wire. The list is the object Legal reviews (see the quick-chat spec and preset list):
 * adding, renaming or re-wording a preset is a Legal re-review. Removing one needs none: delete
 * the id here and in the client's mirror, and ship.
 *
 * Ids are lowercase kebab-case, at most 24 characters (`QUICK_CHAT_ID_PATTERN`); emote ids start
 * with `e-`. Pure data and helpers: no imports, so the frontend can mirror this file as is.
 */

/** Short friendly lines. Shown as text by the client. */
export const QUICK_CHAT_LINES = [
  "hello",
  "have-fun",
  "good-luck",
  "ready",
  "one-sec",
  "brb",
  "gg",
  "nice-race",
  "close-one",
  "that-was-fun",
  "thanks",
  "rematch",
  "one-more",
  "bye-for-now",
] as const;

/** Emotes (icons). Ids start with `e-`. */
export const QUICK_CHAT_EMOTES = [
  "e-paw",
  "e-heart",
  "e-thumbs-up",
  "e-smile",
  "e-wow",
  "e-treat",
  "e-handshake",
  "e-woof",
] as const;

export const QUICK_CHAT_IDS = [
  ...QUICK_CHAT_LINES,
  ...QUICK_CHAT_EMOTES,
] as const;
export type QuickChatId = (typeof QUICK_CHAT_IDS)[number];
export type QuickChatKind = "line" | "emote";

/** Every id must match this (checked by a test, so a typo in the lists above can't ship). */
export const QUICK_CHAT_ID_PATTERN = /^[a-z][a-z0-9-]{0,23}$/;
/** Longest accepted `presetId` on the wire; anything longer is rejected before the lookup. */
export const QUICK_CHAT_ID_MAX_LENGTH = 24;

const KNOWN: ReadonlySet<string> = new Set(QUICK_CHAT_IDS);

/** True only for a string that is exactly one of the whitelisted ids (a Set lookup, never a property lookup on input). */
export function isQuickChatId(value: unknown): value is QuickChatId {
  return typeof value === "string" && KNOWN.has(value);
}

export function quickChatKind(id: QuickChatId): QuickChatKind {
  return id.startsWith("e-") ? "emote" : "line";
}

// ------------------------------------------------------------------ rate limits

/** Per session: at most this many accepted sends per window. */
export const QUICK_CHAT_LIMIT = 5;
export const QUICK_CHAT_WINDOW_MS = 10_000;
/** Per session: minimum time between two accepted sends (the cooldown). */
export const QUICK_CHAT_MIN_GAP_MS = 1_200;
/** Per session: the same id again within this long is refused. */
export const QUICK_CHAT_REPEAT_MS = 4_000;
/** Per room, across all players: at most this many relays per window. */
export const QUICK_CHAT_ROOM_LIMIT = 16;
export const QUICK_CHAT_ROOM_WINDOW_MS = 10_000;
