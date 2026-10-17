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

export type RaceConfig = {
  mode: Settings["mode"];
  time?: number;
  words?: number;
  punctuation: boolean;
  numbers: boolean;
  language: string;
};

/** the local config keys a room's settings override during a race */
export function raceConfigFromSettings(settings: Settings): RaceConfig {
  return {
    mode: settings.mode,
    ...(settings.mode === "time"
      ? { time: settings.mode2 }
      : { words: settings.mode2 }),
    punctuation: settings.punctuation,
    numbers: settings.numbers,
    language: settings.language,
  };
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

/** race:finish input: one entry per word, up to the current word */
export function buildFinishInput(
  history: readonly string[],
  current: string,
): string[] {
  return current === "" ? [...history] : [...history, current];
}
