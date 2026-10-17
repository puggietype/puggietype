import { batch } from "solid-js";

import type { Language } from "@monkeytype/schemas/languages";
import { setConfig } from "../config/setters";
import { Config } from "../config/store";
import { navigationEvent } from "../events/navigation";
import { getActivePage } from "../states/core";
import {
  showErrorNotification,
  showNoticeNotification,
} from "../states/notifications";
import {
  getActiveWordIndex,
  isTestActive,
  isTestRestarting,
} from "../states/test";
import { getCurrentInput } from "../test/events/data";
import { getLiveCachedIncorrectInputs } from "../test/events/live-cache";
import { restart, startTest } from "../test/test-logic";
import { focusWords, isMounted as isTestUIMounted } from "../test/test-ui";
import { MultiplayerClient } from "./client";
import {
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
  raceConfigFromSettings,
  type ProgressPayload,
} from "./helpers";
import type { ClientMessage, ServerMessage, SettingsPatch } from "./protocol";
import {
  race,
  room,
  setConnectionStatus,
  setCountdown,
  setLastError,
  setMyId,
  setOpponentProgress,
  setRace,
  setResults,
  setRoom,
  type RaceInfo,
} from "./store";

const PROGRESS_INTERVAL_MS = 100;
const ROOM_KEY = "puggie-mp-room";

type SavedConfig = Pick<
  typeof Config,
  "mode" | "time" | "words" | "punctuation" | "numbers" | "language"
>;

let savedConfig: SavedConfig | undefined;
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
  sessionStorage.removeItem(ROOM_KEY);
  endRace();
  batch(() => {
    setRoom(undefined);
    setResults(undefined);
  });
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

/** after a reload: rejoin the room this tab was in (the server keeps us 20 s) */
export function resumeSession(name: string): boolean {
  if (sessionStorage.getItem(ROOM_KEY) === null || name === "") return false;
  client.connect(name);
  return true;
}

function send(msg: ClientMessage): void {
  setLastError(undefined);
  client.send(msg);
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
      void beginRace({
        startAt: msg.startAt,
        words: msg.words,
        settings: msg.settings,
      });
      return;
    case "race:progress":
      setOpponentProgress(msg.players);
      return;
    case "race:results":
      setResults(msg.results);
      endRace();
      if (getActivePage() !== "race") goTo(`/r/${room()?.code ?? ""}`);
      return;
    case "error":
      setLastError(msg.message);
      if (msg.code === "ROOM_NOT_FOUND" || msg.code === "ROOM_FULL") {
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

function goTo(url: string): void {
  navigationEvent.dispatch({ url, options: { force: true } });
}

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!check() && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ---------------------------------------------------------------- race

async function beginRace(info: RaceInfo): Promise<void> {
  const token = ++raceToken;
  clearTimers();
  finishSent = false;
  lastProgress = undefined;
  batch(() => {
    setRace(info);
    setResults(undefined);
    setOpponentProgress([]);
    setCountdown(Math.ceil((info.startAt - serverNow()) / 1000));
  });

  applyRaceConfig(info);
  setRaceWords(info.words);
  setRaceInputLocked(true);
  setRaceRestartLocked(false);
  onRaceFinish(sendFinish);

  if (getActivePage() !== "test") goTo("/");
  await waitFor(() => getActivePage() === "test" && isTestUIMounted());
  await waitFor(() => !isTestRestarting());
  if (token !== raceToken) return;
  // regenerate the test from the race words with the room settings
  await restart({ noAnim: true });
  await waitFor(() => !isTestRestarting());
  if (token !== raceToken) return;
  setRaceRestartLocked(true);

  countdownTimer = setInterval(updateCountdown, 100);
  updateCountdown();
  startTimer = setTimeout(
    () => goRace(token),
    Math.max(0, info.startAt - serverNow()),
  );
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
  releaseEngine();
  goTo(`/r/${room()?.code ?? ""}`);
  showNoticeNotification("Finished! Waiting for the others...");
}

function applyRaceConfig(info: RaceInfo): void {
  savedConfig ??= {
    mode: Config.mode,
    time: Config.time,
    words: Config.words,
    punctuation: Config.punctuation,
    numbers: Config.numbers,
    language: Config.language,
  };
  const cfg = raceConfigFromSettings(info.settings);
  const nosave = { nosave: true };
  setConfig("mode", cfg.mode, nosave);
  if (cfg.time !== undefined) setConfig("time", cfg.time, nosave);
  if (cfg.words !== undefined) setConfig("words", cfg.words, nosave);
  setConfig("punctuation", cfg.punctuation, nosave);
  setConfig("numbers", cfg.numbers, nosave);
  setConfig("language", cfg.language as Language, nosave);
}

function restoreConfig(): void {
  const saved = savedConfig;
  if (saved === undefined) return;
  savedConfig = undefined;
  // saved normally, so race values that leaked into storage get overwritten
  setConfig("language", saved.language);
  setConfig("punctuation", saved.punctuation);
  setConfig("numbers", saved.numbers);
  setConfig("time", saved.time);
  setConfig("words", saved.words);
  setConfig("mode", saved.mode);
}

function clearTimers(): void {
  clearTimeout(startTimer);
  clearInterval(countdownTimer);
  clearInterval(progressTimer);
}

/** stop feeding race words and locks into the engine, restore settings */
function releaseEngine(): void {
  clearTimers();
  setRaceInputLocked(false);
  setRaceRestartLocked(false);
  setRaceWords(undefined);
  onRaceFinish(undefined);
  restoreConfig();
}

function endRace(): void {
  raceToken++;
  releaseEngine();
  batch(() => {
    setRace(undefined);
    setCountdown(undefined);
    setOpponentProgress([]);
  });
}
