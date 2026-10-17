import { batch } from "solid-js";

import { setConfig } from "../config/setters";
import { Config } from "../config/store";
import { saveFullConfigToLocalStorage } from "../config/persistence";
import { navigationEvent } from "../events/navigation";
import { getActivePage } from "../states/core";
import {
  showErrorNotification,
  showNoticeNotification,
} from "../states/notifications";
import {
  getActiveWordIndex,
  isResultCalculating,
  isTestActive,
  isTestRestarting,
} from "../states/test";
import { getCurrentInput } from "../test/events/data";
import { getLiveCachedIncorrectInputs } from "../test/events/live-cache";
import { restart, startTest, stop as stopTest } from "../test/test-logic";
import { focusWords, isMounted as isTestUIMounted } from "../test/test-ui";
import { words as testWords } from "../test/test-words";
import { MultiplayerClient } from "./client";
import {
  discardPendingRaceFinish,
  isRaceActive,
  onRaceFinish,
  setRaceInputLocked,
  setRaceRestartLocked,
  setRaceWords,
  type RaceFinishData,
} from "./engine-hooks";
import {
  finishInput,
  progressChanged,
  progressWpm,
  RACE_CONFIG_KEYS,
  raceConfigOverrides,
  type ConfigEntry,
  type ProgressPayload,
} from "./helpers";
import type { ClientMessage, ServerMessage, SettingsPatch } from "./protocol";
import {
  myId,
  race,
  room,
  setConnectionStatus,
  setCountdown,
  setLastError,
  setMyId,
  setOpponentProgress,
  setRace,
  setRaceFinished,
  setResults,
  setRoom,
  type RaceInfo,
} from "./store";

const PROGRESS_INTERVAL_MS = 100;
const ROOM_KEY = "puggie-mp-room";
/** the user's own config while a race overrides it; survives reloads */
const SAVED_CONFIG_KEY = "puggie-mp-saved-config";

let startTimer: ReturnType<typeof setTimeout> | undefined;
let countdownTimer: ReturnType<typeof setInterval> | undefined;
let progressTimer: ReturnType<typeof setInterval> | undefined;
let lastProgress: ProgressPayload | undefined;
let raceStartedAt = 0;
let finishSent = false;
/** bumped per race so a stale async setup can bail out */
let raceToken = 0;

const client = new MultiplayerClient({
  onMessage: handleMessage,
  onStatus: setConnectionStatus,
  onTerminated: (code) => {
    dropRoom();
    showNoticeNotification(
      code === 4000
        ? "This race continued in another tab."
        : "The race server is full, try again later.",
    );
  },
});

export function serverNow(): number {
  return client.serverNow();
}

// ---------------------------------------------------------------- actions

export function connect(name: string): void {
  client.connect(name);
}

export function createRoom(settings?: SettingsPatch): void {
  send({ type: "room:create", settings });
}

export function joinRoom(code: string): void {
  send({ type: "room:join", code });
}

export function leaveRoom(): void {
  send({ type: "room:leave" });
  dropRoom();
}

export function setReady(ready: boolean): void {
  send({ type: "player:ready", ready });
}

export function updateSettings(settings: SettingsPatch): void {
  send({ type: "room:settings", settings });
}

export function startRace(): void {
  send({ type: "race:start" });
}

export function rematch(): void {
  send({ type: "race:rematch" });
}

/**
 * After a reload: rejoin the room this tab was in (the server keeps us for
 * 20 s), and put back config a race had overridden.
 */
export function resumeSession(name: string): boolean {
  // a rejoined race re-applies its settings from a fresh snapshot
  restoreConfig();
  const code = sessionStorage.getItem(ROOM_KEY);
  if (code === null || name === "") return false;
  client.connect(name);
  // resends the snapshot if we're still in the room, errors (and clears the
  // stored code) if the grace period is over
  client.send({ type: "room:join", code });
  return true;
}

function send(msg: ClientMessage): void {
  setLastError(undefined);
  client.send(msg);
}

/** forget the room locally (left, kicked out or session taken over) */
function dropRoom(): void {
  const wasRacing = isRaceActive();
  sessionStorage.removeItem(ROOM_KEY);
  endRace();
  batch(() => {
    setRoom(undefined);
    setResults(undefined);
  });
  // don't leave the race words on screen for a solo test
  if (wasRacing && getActivePage() === "test") void restart({ noAnim: true });
}

// ---------------------------------------------------------------- inbound

function handleMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "welcome":
      setMyId(msg.playerId);
      return;
    case "room:state": {
      const prev = room();
      setRoom(msg);
      sessionStorage.setItem(ROOM_KEY, msg.code);
      if (msg.phase === "lobby" && prev?.phase !== "lobby") {
        // rematch (or a fresh join): back to the lobby
        endRace();
        setResults(undefined);
        if (getActivePage() !== "race") goTo(`/r/${msg.code}`);
      }
      return;
    }
    case "race:countdown":
      onCountdown({
        startAt: msg.startAt,
        words: msg.words,
        settings: msg.settings,
      });
      return;
    case "race:progress":
      setOpponentProgress(msg.players);
      return;
    case "race:results":
      endRace();
      setResults(msg.results);
      if (getActivePage() !== "race") goTo(`/r/${room()?.code ?? ""}`);
      return;
    case "error":
      setLastError(msg.message);
      if (
        msg.code === "ROOM_NOT_FOUND" ||
        msg.code === "ROOM_FULL" ||
        msg.code === "ROOM_IN_PROGRESS"
      ) {
        sessionStorage.removeItem(ROOM_KEY);
      }
      if (msg.code !== "RATE_LIMITED") {
        showErrorNotification(`Multiplayer: ${msg.message}`);
      }
      return;
    case "pong":
      return;
  }
}

function onCountdown(info: RaceInfo): void {
  // a reconnect re-sends the countdown of the race we're already in
  if (race()?.startAt === info.startAt) return;
  const me = room()?.players.find((p) => p.id === myId());
  if (me?.finished === true) {
    // reloaded after finishing: just wait for the results
    batch(() => {
      setRace(info);
      setRaceFinished(true);
    });
    if (getActivePage() !== "race") goTo(`/r/${room()?.code ?? ""}`);
    return;
  }
  void beginRace(info);
}

function goTo(url: string): void {
  navigationEvent.dispatch({ url, options: { force: true } });
}

/** polls until check() passes; false on timeout */
async function waitFor(
  check: () => boolean,
  timeoutMs = 5000,
): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= until) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
}

// ---------------------------------------------------------------- race

async function beginRace(info: RaceInfo): Promise<void> {
  const token = ++raceToken;
  clearTimers();
  finishSent = false;
  lastProgress = undefined;
  batch(() => {
    setRace(info);
    setRaceFinished(false);
    setResults(undefined);
    setOpponentProgress([]);
    setCountdown(Math.max(0, Math.ceil((info.startAt - serverNow()) / 1000)));
  });

  if (!applyRaceConfig(info)) {
    abortRace("Couldn't apply the race settings.");
    return;
  }
  setRaceWords(info.words);
  setRaceInputLocked(true);
  setRaceRestartLocked(false);
  onRaceFinish(sendFinish);

  if (getActivePage() !== "test") goTo("/");
  const ready =
    (await waitFor(() => getActivePage() === "test" && isTestUIMounted())) &&
    (await waitFor(() => !isTestRestarting()));
  if (token !== raceToken) return;
  if (ready) {
    // regenerate the test from the race words with the room settings
    await restart({ noAnim: true });
    await waitFor(() => !isTestRestarting());
    if (token !== raceToken) return;
  }
  if (!ready || testWords.get(0)?.text !== info.words[0]) {
    abortRace("Couldn't load the race words.");
    return;
  }
  setRaceRestartLocked(true);

  countdownTimer = setInterval(updateCountdown, 100);
  updateCountdown();
  startTimer = setTimeout(
    () => goRace(token),
    Math.max(0, info.startAt - serverNow()),
  );
}

function abortRace(message: string): void {
  showErrorNotification(`Multiplayer: ${message}`);
  leaveRoom();
}

function updateCountdown(): void {
  const info = race();
  if (info === undefined) return;
  setCountdown(Math.max(0, Math.ceil((info.startAt - serverNow()) / 1000)));
}

function goRace(token: number): void {
  if (token !== raceToken) return;
  // timers can fire a bit early; wait for the corrected clock
  const info = race();
  if (info === undefined) return;
  const left = info.startAt - serverNow();
  if (left > 0) {
    startTimer = setTimeout(() => goRace(token), left);
    return;
  }
  clearInterval(countdownTimer);
  setCountdown(0);
  setRaceInputLocked(false);
  raceStartedAt = performance.now();
  if (!isTestActive()) startTest(raceStartedAt);
  focusWords(true);
  progressTimer = setInterval(sendProgress, PROGRESS_INTERVAL_MS);
}

function sendProgress(): void {
  if (!isTestActive() || finishSent) return;
  const wordIndex = getActiveWordIndex();
  const charIndex = getCurrentInput().length;
  const testMs = Math.round(performance.now() - raceStartedAt);
  const next: ProgressPayload = {
    wordIndex,
    charIndex,
    testMs,
    wpm: progressWpm(race()?.words ?? [], wordIndex, charIndex, testMs),
    errors: getLiveCachedIncorrectInputs(),
  };
  if (!progressChanged(lastProgress, next)) return;
  lastProgress = next;
  client.send({ type: "race:progress", ...next });
}

function sendFinish(data: RaceFinishData): void {
  if (finishSent) return;
  finishSent = true;
  setRaceFinished(true);
  clearInterval(progressTimer);
  client.send({
    type: "race:finish",
    wpm: data.wpm,
    raw: data.raw,
    acc: data.acc,
    testMs: data.testMs,
    input: finishInput(data.input),
    keyCount: data.keyCount,
  });
  // the test is done for us: unhook the engine and wait on the race page
  releaseEngine({ finished: true });
  goTo(`/r/${room()?.code ?? ""}`);
}

// ---------------------------------------------------------------- config

function loadSavedConfig(): ConfigEntry[] | undefined {
  const raw = sessionStorage.getItem(SAVED_CONFIG_KEY);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as ConfigEntry[];
  } catch {
    return undefined;
  }
}

function applyEntry(entry: ConfigEntry): boolean {
  const [key, value] = entry;
  // the tuple type keeps key and value paired; setConfig can't see that
  return setConfig(key, value as never, { nosave: true });
}

/** override race-affecting config without persisting it; false on failure */
function applyRaceConfig(info: RaceInfo): boolean {
  if (loadSavedConfig() === undefined) {
    const saved = RACE_CONFIG_KEYS.map(
      (key) => [key, structuredClone(Config[key])] as ConfigEntry,
    );
    sessionStorage.setItem(SAVED_CONFIG_KEY, JSON.stringify(saved));
  }
  const overrides = raceConfigOverrides(info.settings);
  if (overrides === undefined) return false;
  for (const entry of overrides) {
    // setConfig returns false for a no-op too, so compare the result
    applyEntry(entry);
    if (JSON.stringify(Config[entry[0]]) !== JSON.stringify(entry[1])) {
      return false;
    }
  }
  return true;
}

function restoreConfig(): void {
  const saved = loadSavedConfig();
  if (saved === undefined) return;
  sessionStorage.removeItem(SAVED_CONFIG_KEY);
  for (const entry of [...saved].reverse()) applyEntry(entry);
  // one write, so race values that leaked into storage are overwritten
  saveFullConfigToLocalStorage(true);
}

// ---------------------------------------------------------------- teardown

function clearTimers(): void {
  clearTimeout(startTimer);
  clearInterval(countdownTimer);
  clearInterval(progressTimer);
}

/** stop feeding race words and locks into the engine, restore settings */
function releaseEngine(options: { finished?: boolean } = {}): void {
  clearTimers();
  // a race ending under us (results, leave) must not become a solo result
  if (isRaceActive() && options.finished !== true) {
    if (isResultCalculating()) discardPendingRaceFinish();
    else if (isTestActive()) stopTest();
  }
  setRaceInputLocked(false);
  setRaceRestartLocked(false);
  setRaceWords(undefined);
  onRaceFinish(undefined);
  restoreConfig();
}

function endRace(): void {
  raceToken++;
  finishSent = false;
  releaseEngine();
  batch(() => {
    setRace(undefined);
    setRaceFinished(false);
    setCountdown(undefined);
    setOpponentProgress([]);
  });
}
