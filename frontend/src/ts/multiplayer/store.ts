import { createSignal } from "solid-js";

import type { ConnectionStatus } from "./client";
import type {
  PlayerProgress,
  RaceResult,
  RoomState,
  Settings,
} from "./protocol";

export type RaceInfo = {
  startAt: number;
  words: string[];
  settings: Settings;
};

const SHOW_CARETS_KEY = "puggie-mp-show-carets";

export const [connectionStatus, setConnectionStatus] =
  createSignal<ConnectionStatus>("idle");
export const [myId, setMyId] = createSignal<string | undefined>();
export const [room, setRoom] = createSignal<RoomState | undefined>();
export const [race, setRace] = createSignal<RaceInfo | undefined>();
export const [opponentProgress, setOpponentProgress] = createSignal<
  PlayerProgress[]
>([]);
/** our race:finish went out (or the server says we already finished) */
export const [raceFinished, setRaceFinished] = createSignal(false);
export const [results, setResults] = createSignal<RaceResult[] | undefined>();
export const [lastError, setLastError] = createSignal<string | undefined>();
/** room code from an /r/CODE invite link, consumed by the race page */
export const [inviteCode, setInviteCode] = createSignal<string | undefined>();
/** seconds left in the 3-2-1, 0 once racing, undefined outside a countdown */
export const [countdown, setCountdown] = createSignal<number | undefined>();

// nicknames are server-assigned now; drop the one older builds stored
localStorage.removeItem("puggie-mp-name");

const [showOpponentCarets, setShowOpponentCaretsSignal] = createSignal(
  localStorage.getItem(SHOW_CARETS_KEY) !== "false",
);
export { showOpponentCarets };

export function setShowOpponentCarets(show: boolean): void {
  localStorage.setItem(SHOW_CARETS_KEY, String(show));
  setShowOpponentCaretsSignal(show);
}

export function isHost(): boolean {
  const r = room();
  return r !== undefined && r.hostId === myId();
}

/** a multiplayer race owns the test page (countdown, racing or results) */
export function inRace(): boolean {
  return race() !== undefined;
}
