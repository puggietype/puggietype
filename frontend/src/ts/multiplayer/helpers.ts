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

export const PRODUCTION_WS_URL = "wss://ws.puggietype.com/ws";
const PRODUCTION_HOSTS = new Set(["puggietype.com", "www.puggietype.com"]);

/**
 * The build-time VITE_WS_URL if set, else the production server on
 * puggietype.com, else same-origin /ws (dev server / local preview proxy).
 */
export function wsUrl(
  location: { protocol: string; host: string; hostname: string },
  configured?: string,
): string {
  if (configured !== undefined && configured !== "") return configured;
  if (PRODUCTION_HOSTS.has(location.hostname)) return PRODUCTION_WS_URL;
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws`;
}

/** a build-time boolean env var: unset/empty -> fallback */
export function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return !["false", "0", "off", "no"].includes(value.toLowerCase());
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
  "oppositeShiftMode",
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
    // a resume replays capitals without a shift key
    ["oppositeShiftMode", "off"],
    ["mode", settings.mode],
    settings.mode === "time"
      ? ["time", settings.mode2]
      : ["words", settings.mode2],
    ["punctuation", settings.punctuation],
    ["numbers", settings.numbers],
    ["language", language.data],
  ];
}

export type RacePosition = { wordIndex: number; charIndex: number };

/** the text typed up to a position, as the engine would have received it */
export function resumeText(
  words: readonly string[],
  wordIndex: number,
  charIndex: number,
): string {
  const done = words.slice(0, wordIndex);
  const partial = (words[wordIndex] ?? "").slice(0, charIndex);
  return (
    done.join(" ") +
    (done.length > 0 && wordIndex < words.length ? " " : "") +
    partial
  );
}

export function isBehind(pos: RacePosition, floor: RacePosition): boolean {
  return (
    pos.wordIndex < floor.wordIndex ||
    (pos.wordIndex === floor.wordIndex && pos.charIndex < floor.charIndex)
  );
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

/**
 * Roving focus in a grid of `count` items, `cols` wide (radio group arrows):
 * Left/Right wrap within the row, Up/Down move between rows (wrapping).
 */
export function gridMove(
  index: number,
  key: string,
  cols: number,
  count: number,
): number | undefined {
  const rows = Math.ceil(count / cols);
  const row = Math.floor(index / cols);
  const col = index % cols;
  const rowLen = Math.min(cols, count - row * cols);
  switch (key) {
    case "ArrowLeft":
      return row * cols + ((col - 1 + rowLen) % rowLen);
    case "ArrowRight":
      return row * cols + ((col + 1) % rowLen);
    case "ArrowUp":
    case "ArrowDown": {
      const step = key === "ArrowUp" ? rows - 1 : 1;
      let r = (row + step) % rows;
      // a short last row: skip it if it has no item in this column
      while (r * cols + col >= count) r = (r + step) % rows;
      return r * cols + col;
    }
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}
