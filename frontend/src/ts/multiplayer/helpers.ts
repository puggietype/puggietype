import type { Config as ConfigSchema } from "@monkeytype/schemas/configs";
import { LanguageSchema } from "@monkeytype/schemas/languages";

import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type RoomState,
  type Settings,
} from "./protocol";

const CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function normalizeRoomCode(input: string): string | undefined {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return CODE_RE.test(code) ? code : undefined;
}

export function inviteLink(origin: string, code: string): string {
  return `${origin}/r/${code}`;
}

export function parseInvitePath(pathname: string): string | undefined {
  const match = /^\/r\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] !== undefined ? normalizeRoomCode(match[1]) : undefined;
}

export function wsUrl(location: { protocol: string; host: string }): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws`;
}

/** mirrors the server's race:start rules */
export function canStartRace(room: RoomState, myId: string): boolean {
  return (
    room.phase === "lobby" &&
    room.hostId === myId &&
    room.players.length >= 2 &&
    room.players.every((p) => p.id === room.hostId || p.ready)
  );
}

export type ConfigEntry = {
  [K in keyof ConfigSchema]: [K, ConfigSchema[K]];
}[keyof ConfigSchema];

/** every config key a race may override, saved before and restored after */
export const RACE_CONFIG_KEYS = [
  "funbox",
  "lazyMode",
  "difficulty",
  "minWpm",
  "minAcc",
  "minBurst",
  "stopOnError",
  "mode",
  "time",
  "words",
  "punctuation",
  "numbers",
  "language",
] as const satisfies readonly (keyof ConfigSchema)[];

/**
 * Local config for a race, in apply order: the room's settings, plus neutral
 * values for anything that changes the words or can fail or alter a result
 * the server recomputes. Funboxes go first so they can't block mode changes.
 * Undefined if this client doesn't know the room's language.
 */
export function raceConfigOverrides(
  settings: Settings,
): ConfigEntry[] | undefined {
  const language = LanguageSchema.safeParse(settings.language);
  if (!language.success) return undefined;
  return [
    ["funbox", []],
    ["lazyMode", false],
    ["difficulty", "normal"],
    ["minWpm", "off"],
    ["minAcc", "off"],
    ["minBurst", "off"],
    ["stopOnError", "off"],
    ["mode", settings.mode],
    settings.mode === "time"
      ? ["time", settings.mode2]
      : ["words", settings.mode2],
    ["punctuation", settings.punctuation],
    ["numbers", settings.numbers],
    ["language", language.data],
  ];
}

export type ProgressPayload = {
  wordIndex: number;
  charIndex: number;
  testMs: number;
  wpm: number;
  errors: number;
};

/** testMs alone or sub-1 wpm jitter doesn't warrant a send */
export function progressChanged(
  prev: ProgressPayload | undefined,
  next: ProgressPayload,
): boolean {
  if (prev === undefined) return true;
  return (
    prev.wordIndex !== next.wordIndex ||
    prev.charIndex !== next.charIndex ||
    prev.errors !== next.errors ||
    Math.round(prev.wpm) !== Math.round(next.wpm)
  );
}

/**
 * race:finish input: what was typed per word. The engine's input history keeps
 * the separator (space or newline) on committed words; the server wants it off.
 */
export function finishInput(history: readonly string[]): string[] {
  return history.map((word) => word.replace(/[ \n]$/, ""));
}

/**
 * wpm from the caret position alone (chars of completed words plus spaces,
 * plus the current word), so progress can show a live speed every 100 ms.
 */
export function progressWpm(
  words: readonly string[],
  wordIndex: number,
  charIndex: number,
  testMs: number,
): number {
  if (testMs <= 0) return 0;
  let chars = 0;
  for (let i = 0; i < wordIndex && i < words.length; i++) {
    chars += (words[i] ?? "").length + 1;
  }
  chars += Math.min(charIndex, (words[wordIndex] ?? "").length);
  return Math.round((chars / 5 / (testMs / 60000)) * 100) / 100;
}
