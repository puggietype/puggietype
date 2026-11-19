/**
 * Quick-chat client logic (pure, no Solid): what each preset shows, when the UI may appear, local
 * mutes, the feed, and the send cooldown. The wire carries ids only; the text and icon for an id
 * live here and nowhere else. Never build display text from anything the server sends.
 */
import type { FaSolidIcon } from "../types/font-awesome";
import type { Phase, RoomState } from "./protocol";
import {
  isQuickChatId,
  QUICK_CHAT_EMOTES,
  QUICK_CHAT_LIMIT,
  QUICK_CHAT_LINES,
  QUICK_CHAT_MIN_GAP_MS,
  QUICK_CHAT_REPEAT_MS,
  QUICK_CHAT_WINDOW_MS,
  quickChatKind,
  type QuickChatId,
  type QuickChatKind,
} from "./quick-chat-presets";

export type QuickChatItem = {
  id: QuickChatId;
  kind: QuickChatKind;
  /** shown on the button and in the feed; for an emote this is its accessible name */
  text: string;
  /** emotes only (Font Awesome Free solid) */
  icon?: FaSolidIcon;
};

const LINE_TEXT: Record<(typeof QUICK_CHAT_LINES)[number], string> = {
  hello: "hi everyone!",
  "have-fun": "have fun!",
  "good-luck": "good luck!",
  ready: "ready!",
  "one-sec": "one sec!",
  brb: "brb",
  gg: "gg",
  "nice-race": "nice race!",
  "close-one": "that was close!",
  "that-was-fun": "that was fun!",
  thanks: "thanks!",
  rematch: "rematch?",
  "one-more": "one more?",
  "bye-for-now": "bye for now!",
};

// literal icon names (not built dynamically): the Font Awesome subset scans the source for them
const EMOTE: Record<
  (typeof QUICK_CHAT_EMOTES)[number],
  { text: string; icon: FaSolidIcon }
> = {
  "e-paw": { text: "paw", icon: "fa-paw" },
  "e-heart": { text: "heart", icon: "fa-heart" },
  "e-thumbs-up": { text: "thumbs up", icon: "fa-thumbs-up" },
  "e-smile": { text: "smile", icon: "fa-smile" },
  "e-wow": { text: "wow", icon: "fa-grin-stars" },
  "e-treat": { text: "treat", icon: "fa-bone" },
  "e-handshake": { text: "handshake", icon: "fa-handshake" },
  "e-woof": { text: "woof", icon: "fa-dog" },
};

function buildItems(): Record<QuickChatId, QuickChatItem> {
  const items = {} as Record<QuickChatId, QuickChatItem>;
  for (const id of QUICK_CHAT_LINES) {
    items[id] = { id, kind: "line", text: LINE_TEXT[id] };
  }
  for (const id of QUICK_CHAT_EMOTES) {
    items[id] = { id, kind: "emote", ...EMOTE[id] };
  }
  return items;
}

/** every whitelisted id, exactly (the Record type and a test keep this in step with the id list) */
export const QUICK_CHAT_ITEMS: Readonly<Record<QuickChatId, QuickChatItem>> =
  buildItems();

export const QUICK_CHAT_LINE_ITEMS: readonly QuickChatItem[] =
  QUICK_CHAT_LINES.map((id) => QUICK_CHAT_ITEMS[id]);
export const QUICK_CHAT_EMOTE_ITEMS: readonly QuickChatItem[] =
  QUICK_CHAT_EMOTES.map((id) => QUICK_CHAT_ITEMS[id]);

export function quickChatItem(id: QuickChatId): QuickChatItem {
  return QUICK_CHAT_ITEMS[id];
}

/** what a screen reader hears for one relay (never built from the wire) */
export function quickChatAnnouncement(
  senderName: string,
  id: QuickChatId,
): string {
  const item = QUICK_CHAT_ITEMS[id];
  return item.kind === "emote"
    ? `${senderName} sent an emote: ${item.text}`
    : `${senderName} says: ${item.text}`;
}

// ------------------------------------------------------------------ where it may show

export type QuickChatRoom = Pick<RoomState, "quickMatch" | "open" | "phase">;

export type QuickChatContext = {
  /** client flag AND welcome.features.quickChat */
  on: boolean;
  /** this tab is in the kids flow: quick-chat is fully hidden */
  kids: boolean;
  room: QuickChatRoom | undefined;
  /** the "hide quick-chat" switch */
  hidden: boolean;
};

/** private friend rooms only, never the kids flow, never with the flag off */
export function quickChatAvailable(ctx: QuickChatContext): boolean {
  return (
    ctx.on &&
    !ctx.kids &&
    ctx.room !== undefined &&
    !ctx.room.quickMatch &&
    !ctx.room.open
  );
}

/** the server accepts sends only in the lobby and results phases */
export function quickChatPhaseOk(phase: Phase): boolean {
  return phase === "lobby" || phase === "results";
}

/** the picker may be used right now (cooldown is separate) */
export function canSendQuickChat(ctx: QuickChatContext): boolean {
  return (
    quickChatAvailable(ctx) &&
    !ctx.hidden &&
    ctx.room !== undefined &&
    quickChatPhaseOk(ctx.room.phase)
  );
}

export type RelayCheck = {
  ctx: QuickChatContext;
  /** the wire values, untrusted until checked here */
  playerId: unknown;
  presetId: unknown;
  /** humans in the current room */
  humanIds: ReadonlySet<string>;
  muted: ReadonlySet<string>;
};

/** whether an incoming `chat:preset` is shown: unknown ids, strangers, muted players and hidden chat are dropped */
export function shouldShowRelay(c: RelayCheck): boolean {
  if (!canSendQuickChat(c.ctx)) return false;
  if (!isQuickChatId(c.presetId)) return false;
  if (typeof c.playerId !== "string" || !c.humanIds.has(c.playerId)) {
    return false;
  }
  return !c.muted.has(c.playerId);
}

// ------------------------------------------------------------------ feed

export const QUICK_CHAT_FEED_MAX = 5;

export type QuickChatEntry = {
  /** monotonic, for keyed rendering */
  seq: number;
  playerId: string;
  presetId: QuickChatId;
  at: number;
};

/** newest last, at most `max` entries */
export function appendFeed(
  feed: readonly QuickChatEntry[],
  entry: QuickChatEntry,
  max = QUICK_CHAT_FEED_MAX,
): QuickChatEntry[] {
  return [...feed, entry].slice(-max);
}

export function dropPlayerFromFeed(
  feed: readonly QuickChatEntry[],
  playerId: string,
): QuickChatEntry[] {
  return feed.filter((e) => e.playerId !== playerId);
}

// ------------------------------------------------------------------ mutes and hide (local only)

/** per-player mutes: this tab only, cleared when it closes */
export const QUICK_CHAT_MUTED_KEY = "puggie-qc-muted";
/** "hide quick-chat": until turned off or site data is cleared */
export const QUICK_CHAT_HIDDEN_KEY = "puggie-qc-hidden";
export const QUICK_CHAT_MUTED_MAX = 32;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadMuted(storage: Store | undefined): string[] {
  try {
    const raw = storage?.getItem(QUICK_CHAT_MUTED_KEY);
    if (raw === null || raw === undefined) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string" && v.length <= 64)
      .slice(-QUICK_CHAT_MUTED_MAX);
  } catch {
    return [];
  }
}

export function saveMuted(
  storage: Store | undefined,
  ids: readonly string[],
): void {
  try {
    storage?.setItem(
      QUICK_CHAT_MUTED_KEY,
      JSON.stringify(ids.slice(-QUICK_CHAT_MUTED_MAX)),
    );
  } catch {
    // storage blocked: the mute holds for this page only
  }
}

/** toggle one id; the oldest mute drops past the cap */
export function toggleMuted(
  muted: readonly string[],
  playerId: string,
): string[] {
  return muted.includes(playerId)
    ? muted.filter((id) => id !== playerId)
    : [...muted, playerId].slice(-QUICK_CHAT_MUTED_MAX);
}

export function loadHidden(storage: Store | undefined): boolean {
  try {
    return storage?.getItem(QUICK_CHAT_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveHidden(storage: Store | undefined, hidden: boolean): void {
  try {
    if (hidden) storage?.setItem(QUICK_CHAT_HIDDEN_KEY, "1");
    else storage?.removeItem(QUICK_CHAT_HIDDEN_KEY);
  } catch {
    // storage blocked: the choice holds for this page only
  }
}

// ------------------------------------------------------------------ cooldown (mirrors the server limits)

/**
 * ms until a send of `id` would pass the server's per-player limits (0: now): the gap since the last
 * send, the burst window, and (with an id) the same-id repeat window. The server stays the authority.
 */
export function quickChatWaitMs(
  sends: readonly number[],
  lastById: ReadonlyMap<string, number>,
  id: QuickChatId | undefined,
  now: number,
): number {
  let wait = 0;
  const last = sends.at(-1);
  if (last !== undefined) {
    wait = Math.max(wait, last + QUICK_CHAT_MIN_GAP_MS - now);
  }
  const inWindow = sends.filter((t) => now - t < QUICK_CHAT_WINDOW_MS);
  if (inWindow.length >= QUICK_CHAT_LIMIT) {
    const oldest = inWindow.at(inWindow.length - QUICK_CHAT_LIMIT);
    if (oldest !== undefined) {
      wait = Math.max(wait, oldest + QUICK_CHAT_WINDOW_MS - now);
    }
  }
  if (id !== undefined) {
    const prev = lastById.get(id);
    if (prev !== undefined) {
      wait = Math.max(wait, prev + QUICK_CHAT_REPEAT_MS - now);
    }
  }
  return Math.max(0, wait);
}

export { isQuickChatId, quickChatKind };
