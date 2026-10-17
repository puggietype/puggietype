// Copied verbatim from puggietype-server/src/protocol.ts. Keep in sync.
/* eslint-disable typescript/consistent-type-definitions, prefer-template, typescript/prefer-optional-chain -- verbatim copy */
/**
 * PuggieType multiplayer wire protocol.
 *
 * Standalone: depends only on zod, so the frontend can copy this file verbatim.
 * Every message is a JSON object with a `type` discriminator. See PROTOCOL.md.
 */
import { z } from "zod";

export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 8;
/** 31^8 ≈ 8.5e11 codes; with join rate limits, guessing a live lobby is impractical. */
export const ROOM_CODE_LENGTH = 8;
/** Unambiguous alphabet: no 0/O, 1/I/L. */
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

// ---------------------------------------------------------------- settings

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

/** Partial settings as sent by clients; merged over the current settings, then validated. */
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

/** mode2 used when the mode changes and the old mode2 is not valid for the new mode. */
export const DEFAULT_MODE2 = { time: 30, words: 25 } as const;

export const DEFAULT_SETTINGS: Settings = {
  mode: "time",
  mode2: 30,
  punctuation: false,
  numbers: false,
  language: "english",
};

// ---------------------------------------------------------------- client -> server

const finite = z.number().finite();
const nonNeg = finite.min(0);

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    // No `name`: the server assigns nicknames. Unknown keys (e.g. a legacy `name`) are stripped.
    /** Reconnect: both the public playerId and the secret sessionToken from `welcome`. */
    playerId: z.string().min(1).max(64).optional(),
    sessionToken: z.string().min(1).max(128).optional(),
    /** The user confirmed the age gate (13+). Required before room:create / room:join. */
    ageConfirmed: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("room:create"),
    settings: SettingsPatchSchema.optional(),
  }),
  z.object({ type: z.literal("room:join"), code: z.string().min(1).max(16) }),
  z.object({ type: z.literal("room:leave") }),
  /** Host only, lobby or results phase: remove a player; they can't rejoin this code for 10 min. */
  z.object({
    type: z.literal("room:kick"),
    playerId: z.string().min(1).max(64),
  }),
  z.object({ type: z.literal("room:settings"), settings: SettingsPatchSchema }),
  z.object({ type: z.literal("player:ready"), ready: z.boolean() }),
  /** Lobby only: swap your server-assigned nickname for a new one, unique in the room. */
  z.object({ type: z.literal("player:reroll") }),
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

// ---------------------------------------------------------------- server -> client

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
  color: PlayerColor;
  ready: boolean;
  connected: boolean;
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
  players: PlayerState[];
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
  | "NOT_ENOUGH_PLAYERS"
  | "NOT_ALL_READY"
  | "INVALID_SETTINGS"
  | "ALREADY_FINISHED"
  | "RATE_LIMITED"
  | "AGE_REQUIRED"
  | "PLAYER_NOT_FOUND"
  | "KICKED"
  | "SERVER_FULL"
  | "INTERNAL";

export type ServerMessage =
  | {
      type: "welcome";
      playerId: string;
      sessionToken: string;
      name: string;
      protocol: number;
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
  /** The server closed your room (inactivity); you are no longer in it and its code is gone. */
  | { type: "room:closed"; reason: "idle" }
  /** The host removed you from your room. */
  | { type: "room:kicked" }
  | { type: "error"; code: ErrorCode; message: string };
export type ServerMessageType = ServerMessage["type"];

/** Parse a raw inbound frame. Returns the message or a human-readable error. */
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
