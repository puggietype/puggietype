// Mirrors the multiplayer server's message contract. Update both sides together.
/* eslint-disable typescript/consistent-type-definitions, prefer-template, typescript/prefer-optional-chain -- matches server style */
/**
 * Client-side types and zod schemas for the multiplayer WebSocket messages.
 *
 * Only zod is imported. Each frame is JSON with a `type` field selecting the variant.
 */
import { z } from "zod";

export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 8;
/** Code space is 31^8 (~8.5e11); combined with join throttling, brute-forcing a lobby isn't realistic. */
export const ROOM_CODE_LENGTH = 8;
/** Excludes look-alike glyphs (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PLAYER_COLORS = [
  "opp1",
  "opp2",
  "opp3",
  "opp4",
  "opp5",
  "opp6",
  "opp7",
  "opp8",
] as const;
export const TIME_MODE2 = [15, 30, 60, 120] as const;
export const WORDS_MODE2 = [10, 25, 50, 100] as const;

/** Dogs a player can pick. Fixed enum (no user text); not kept once the room ends. */
export const CHARACTERS = [
  "puggie",
  "chowie",
  "frenchie",
  "tuckie",
  "huskie",
  "corgie",
  "shibie",
  "goldie",
] as const;
export const CharacterSchema = z.enum(CHARACTERS);
export type Character = z.infer<typeof CharacterSchema>;
export const DEFAULT_CHARACTER: Character = "puggie";
/** Max dog switches per player in each window; anything over is ignored without an error. */
export const CHARACTER_CHANGE_LIMIT = 10;
export const CHARACTER_CHANGE_WINDOW_MS = 10_000;

/** Open rooms: minimum gap (ms) between `rooms:list` pushes to one subscriber. */
export const ROOMS_LIST_THROTTLE_MS = 1000;
/** Open rooms: cap on entries in one `rooms:list`, most recent first. */
export const MAX_LISTED_ROOMS = 50;
/** Per-session budget for `room:setOpen` + `rooms:list` in each window; over it -> RATE_LIMITED. */
export const OPEN_ROOMS_REQUEST_LIMIT = 10;
export const OPEN_ROOMS_REQUEST_WINDOW_MS = 10_000;

/** Quick Match: `queue:join` budget per window, per session and per IP. */
export const QUEUE_JOIN_LIMIT = 6;
export const QUEUE_JOIN_IP_LIMIT = 20;
export const QUEUE_JOIN_WINDOW_MS = 60_000;
/** Quick Match: max queued players; once reached `queue:join` returns QUEUE_FULL. */
export const MAX_QUEUE = 1000;
/** Quick Match: upper bound applied to `claimedWpm` (lower bound 0). */
export const MAX_CLAIMED_WPM = 300;

/** Reasons a report may carry. Fixed list; no user-written text. */
export const REPORT_REASONS = ["cheating", "afk", "name", "other"] as const;
export const ReportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof ReportReasonSchema>;
/** `report:player` budget per window, per session and per IP. */
export const REPORT_LIMIT = 5;
export const REPORT_IP_LIMIT = 15;
export const REPORT_WINDOW_MS = 10 * 60_000;

// === Room settings ===

export const SettingsSchema = z
  .object({
    mode: z.enum(["time", "words"]),
    mode2: z.number().int(),
    punctuation: z.boolean(),
    numbers: z.boolean(),
    language: z.string().regex(/^[a-z0-9_]{1,64}$/),
  })
  .superRefine((s, ctx) => {
    const allowed: readonly number[] =
      s.mode === "time" ? TIME_MODE2 : WORDS_MODE2;
    if (!allowed.includes(s.mode2)) {
      ctx.addIssue({
        code: "custom",
        path: ["mode2"],
        message: `mode2 for ${s.mode} must be one of ${allowed.join(", ")}`,
      });
    }
  });
export type Settings = z.infer<typeof SettingsSchema>;

/** Client-sent subset of settings; applied on top of the room's settings before validation. */
export const SettingsPatchSchema = z
  .object({
    mode: z.enum(["time", "words"]),
    mode2: z.number().int(),
    punctuation: z.boolean(),
    numbers: z.boolean(),
    language: z.string(),
  })
  .partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

/** Fallback mode2 when switching mode leaves the previous mode2 invalid. */
export const DEFAULT_MODE2 = { time: 30, words: 25 } as const;

export const DEFAULT_SETTINGS: Settings = {
  mode: "time",
  mode2: 30,
  punctuation: false,
  numbers: false,
  language: "english",
};

// === Messages sent by the client ===

const finite = z.number().finite();
const nonNeg = finite.min(0);

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    // Nicknames come from the server, so there's no `name`; extra keys like an old `name` get dropped.
    /** To resume a session, send back both values received in `welcome` (id is public, token is secret). */
    playerId: z.string().min(1).max(64).optional(),
    sessionToken: z.string().min(1).max(128).optional(),
    /** Set once the 13+ age check is accepted; room:create and room:join need it. */
    ageConfirmed: z.boolean().optional(),
    /** Starting dog. Bad or unknown values fall back to "puggie" rather than erroring, for older clients. */
    character: CharacterSchema.catch(DEFAULT_CHARACTER).optional(),
  }),
  z.object({
    type: z.literal("room:create"),
    settings: SettingsPatchSchema.optional(),
  }),
  z.object({ type: z.literal("room:join"), code: z.string().min(1).max(16) }),
  z.object({ type: z.literal("room:leave") }),
  /** Host, in lobby/results: kick someone. That player is barred from this code for 10 minutes. */
  z.object({
    type: z.literal("room:kick"),
    playerId: z.string().min(1).max(64),
  }),
  z.object({ type: z.literal("room:settings"), settings: SettingsPatchSchema }),
  z.object({ type: z.literal("player:ready"), ready: z.boolean() }),
  /** In lobby: ask the server for a different nickname (still unique within the room). */
  z.object({ type: z.literal("player:reroll") }),
  /** Choose a dog; allowed in lobby/results as long as you aren't marked ready. */
  z.object({ type: z.literal("player:character"), character: CharacterSchema }),
  /** Open rooms (flagged): host toggles listing during lobby; listed lobbies show in `rooms:list`. */
  z.object({ type: z.literal("room:setOpen"), open: z.boolean() }),
  /**
   * Quick Match (flagged): join matchmaking, leaving any current room. `claimedWpm` is the pace
   * the client reports; the server clamps it and prefers a pace it has verified itself when available.
   */
  z.object({ type: z.literal("queue:join"), claimedWpm: finite.optional() }),
  z.object({ type: z.literal("queue:leave") }),
  /**
   * Player reports (flagged): flag a human in the same room. Strict schema, so unexpected keys
   * such as a comment field make the message invalid and nothing extra is kept.
   */
  z.strictObject({
    type: z.literal("report:player"),
    playerId: z.string().min(1).max(64),
    reason: ReportReasonSchema,
  }),
  /** Open rooms (flagged): fetch the listing immediately and keep receiving rate-limited updates. */
  z.object({ type: z.literal("rooms:list") }),
  z.object({ type: z.literal("rooms:unsubscribe") }),
  z.object({ type: z.literal("race:start") }),
  z.object({
    type: z.literal("race:progress"),
    wordIndex: z.number().int().min(0).max(100_000),
    charIndex: z.number().int().min(0).max(1_000),
    testMs: nonNeg,
    wpm: nonNeg,
    errors: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("race:finish"),
    wpm: nonNeg,
    raw: nonNeg,
    acc: finite,
    testMs: nonNeg,
    input: z.array(z.string().max(200)).max(5_000),
    keyCount: z.number().int().min(0),
  }),
  z.object({ type: z.literal("race:rematch") }),
  z.object({ type: z.literal("ping"), t: finite }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];
export type ClientMessageOf<T extends ClientMessageType> = Extract<
  ClientMessage,
  { type: T }
>;

// === Messages sent by the server ===

export type Phase = "lobby" | "countdown" | "racing" | "results";
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export interface Progress {
  wordIndex: number;
  charIndex: number;
  testMs: number;
  wpm: number;
}

export interface PlayerState {
  id: string;
  name: string;
  /** True for server-run bot players (planned for Quick Match); currently never set. */
  isBot: boolean;
  color: PlayerColor;
  ready: boolean;
  connected: boolean;
  character: Character;
  progress: Progress;
  finished: boolean;
  place?: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  settings: Settings;
  settingsVersion: number;
  /** Whether the room shows in `rooms:list` (lobby and has space). False whenever the flag is disabled. */
  open: boolean;
  /** Whether Quick Match made the room. Older servers omit it (false). */
  quickMatch: boolean;
  players: PlayerState[];
}

/** Bucketed room age for listings, so precise creation times stay private. */
export type RoomAge = "lt1m" | "lt5m" | "lt15m" | "lt1h" | "gte1h";

/**
 * A single row of `rooms:list`. Carries just enough to choose and join a lobby by code; it
 * intentionally leaves out names, ids (players or host), IP addresses and tokens.
 */
export interface OpenRoomEntry {
  code: string;
  settings: Settings;
  /** Count of non-bot players. */
  humans: number;
  /** Count of bots; stays 0 until Quick Match ships. */
  bots: number;
  maxPlayers: number;
  /** Only ever "lobby", since full, racing or closed rooms are omitted. */
  phase: Phase;
  createdAgo: RoomAge;
}

export interface PlayerProgress extends Progress {
  id: string;
  finished: boolean;
}

export type FlagReason =
  | "wpm_mismatch"
  | "wpm_too_high"
  | "progress_jump"
  | "finish_before_start"
  | "keycount_low"
  | "progress_missing";

export interface RaceResult {
  playerId: string;
  name: string;
  /** Same as PlayerState.isBot; bot results don't count toward stats. */
  isBot: boolean;
  place: number;
  wpm: number;
  raw: number;
  acc: number;
  testMs: number;
  finished: boolean;
  flagged: boolean;
  reasons: FlagReason[];
}

export type ErrorCode =
  | "BAD_MESSAGE"
  | "NOT_HELLO"
  | "NOT_IN_ROOM"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_IN_PROGRESS"
  | "NOT_HOST"
  | "WRONG_PHASE"
  | "READY_LOCKED"
  | "FEATURE_DISABLED"
  | "NOT_ENOUGH_PLAYERS"
  | "NOT_ALL_READY"
  | "INVALID_SETTINGS"
  | "ALREADY_FINISHED"
  | "RATE_LIMITED"
  | "AGE_REQUIRED"
  | "PLAYER_NOT_FOUND"
  | "KICKED"
  | "SERVER_FULL"
  | "QUEUE_FULL"
  | "CANNOT_REPORT"
  | "ALREADY_REPORTED"
  | "INTERNAL";

export interface Features {
  /** Disabled: all players are puggie, `player:character` errors, and the picker is hidden. */
  characterSelect: boolean;
  /** Disabled: `room:setOpen`, `rooms:list` and `rooms:unsubscribe` return FEATURE_DISABLED. */
  openRooms: boolean;
  /** Disabled: queue messages return FEATURE_DISABLED and the Quick Match UI is hidden. */
  quickMatch: boolean;
  /** Disabled: `report:player` returns FEATURE_DISABLED and the report control is hidden. */
  report: boolean;
}

export type ServerMessage =
  | {
      type: "welcome";
      playerId: string;
      sessionToken: string;
      name: string;
      protocol: number;
      /** Feature toggles the client should respect; older servers omit this. */
      features?: Features;
    }
  | { type: "pong"; t: number; serverNow: number }
  | ({ type: "room:state" } & RoomState)
  | {
      type: "race:countdown";
      startAt: number;
      words: string[];
      settings: Settings;
    }
  | { type: "race:progress"; players: PlayerProgress[] }
  | { type: "race:results"; results: RaceResult[] }
  /** Listing of open rooms; `racing` counts humans in a countdown or race across the server. */
  | { type: "rooms:list"; rooms: OpenRoomEntry[]; racing: number }
  /**
   * Quick Match: pushed when you join and then once a second while waiting. `band` = your pace
   * bucket (like "60–80 wpm"), `widenedTo` = range being matched now, `waitedMs` = time queued.
   */
  | { type: "queue:status"; band: string; widenedTo: string; waitedMs: number }
  /** Quick Match: match found in room `code`; expect `room:state` then `race:countdown`. */
  | { type: "queue:matched"; code: string }
  /** Quick Match: removed from the queue. `left` = you left or created/joined a room; `timeout` = 60 s elapsed. */
  | { type: "queue:left"; reason: "left" | "timeout" }
  /** Player reports: acknowledgement that the report went through. */
  | { type: "report:received" }
  /** Room shut down for inactivity; you've been removed and the code no longer exists. */
  | { type: "room:closed"; reason: "idle" }
  /** You were kicked by the host. */
  | { type: "room:kicked" }
  /** Socket cap reached: sent once, then the socket is closed with 4503 "server_full". */
  | { type: "server_full"; retryAfterMs: number; message: string }
  /** `retryAfterMs` is set on SERVER_FULL (room cap): try again after that long. */
  | { type: "error"; code: ErrorCode; message: string; retryAfterMs?: number };
export type ServerMessageType = ServerMessage["type"];

/** Decode and validate one incoming frame, yielding the message or a readable error string. */
export function parseClientMessage(
  raw: string,
): { ok: true; msg: ClientMessage } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  const result = ClientMessageSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue && issue.path.length ? issue.path.join(".") + ": " : "";
    return { ok: false, error: where + (issue?.message ?? "invalid message") };
  }
  return { ok: true, msg: result.data };
}
