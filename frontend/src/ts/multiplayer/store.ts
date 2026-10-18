import { createSignal } from "solid-js";

import { loadCharacter, saveCharacter } from "./character-storage";
import type { ConnectionStatus } from "./client";
import { isFlagEnabled } from "./feature-flags";
import {
  DEFAULT_CHARACTER,
  type Character,
  type Features,
  type PlayerProgress,
  type RaceResult,
  type RoomState,
  type Settings,
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

const [savedCharacter, setSavedCharacterSignal] = createSignal(loadCharacter());
export { savedCharacter };

export function setSavedCharacter(character: Character): void {
  saveCharacter(character);
  setSavedCharacterSignal(character);
}

/** feature flags from the server's welcome (absent: an older server) */
export const [serverFeatures, setServerFeatures] = createSignal<
  Features | undefined
>();

/** dog picking is on here (client flag) and on the server we talk to */
export function characterSelectOn(): boolean {
  return (
    isFlagEnabled("characterSelect") &&
    serverFeatures()?.characterSelect === true
  );
}

/** the dog we type as: our seat's in a room, else the saved pick (solo) */
export function myCharacter(): Character {
  if (!isFlagEnabled("characterSelect")) return DEFAULT_CHARACTER;
  const seat = room()?.players.find((p) => p.id === myId());
  return seat?.character ?? savedCharacter();
}

export function isHost(): boolean {
  const r = room();
  return r !== undefined && r.hostId === myId();
}

/** a multiplayer race owns the test page (countdown, racing or results) */
export function inRace(): boolean {
  return race() !== undefined;
}
