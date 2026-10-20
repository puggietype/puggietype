import { batch } from "solid-js";

import { setConfig } from "../config/setters";
import { Config } from "../config/store";
import { saveFullConfigToLocalStorage } from "../config/persistence";
import { onTestOrRaceStart } from "../controllers/ad-controller";
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
import { emulateInsertText } from "../input/handlers/insert-text";
import { restart, startTest, stop as stopTest } from "../test/test-logic";
import { focusWords, isMounted as isTestUIMounted } from "../test/test-ui";
import { words as testWords } from "../test/test-words";
import { isAgeConfirmed } from "./age-gate";
import { MultiplayerClient } from "./client";
import { getClientId, isValidClientId, readStoredClientId } from "./client-id";
import {
  discardPendingRaceFinish,
  isRaceActive,
  onRaceFinish,
  setRaceInputLocked,
  setRaceRestartLocked,
  setRaceWords,
  type RaceFinishData,
} from "./engine-hooks";
import { isFlagEnabled } from "./feature-flags";
import { MULTIPLAYER_ENABLED } from "./flags";
import {
  finishInput,
  isBehind,
  progressChanged,
  progressWpm,
  RACE_CONFIG_KEYS,
  raceConfigOverrides,
  resumeText,
  type ConfigEntry,
  type ProgressPayload,
  type RacePosition,
} from "./helpers";
import { parseRoomsList } from "./open-rooms";
import type {
  Character,
  ClientMessage,
  ErrorCode,
  PlayerState,
  ReportReason,
  RoomState,
  ServerMessage,
  SettingsPatch,
} from "./protocol";
import { applyQueueStatus, startQueue } from "./quick-match";
import {
  characterSelectOn,
  myId,
  openRoomsOn,
  opponentProgress,
  queue,
  quickMatchOn,
  race,
  reportOn,
  reports,
  room,
  setConnectionStatus,
  setCountdown,
  setLastError,
  setMyId,
  setOpenRooms,
  setOpponentProgress,
  setQueue,
  setRace,
  setRaceFinished,
  setReports,
  setResults,
  setRoom,
  setSavedCharacter,
  setServerFeatures,
  type RaceInfo,
} from "./store";

const PROGRESS_INTERVAL_MS = 100;
const RACE_PATH_RE = /^\/(race|r\/[^/]+)\/?$/;
const ROOM_KEY = "puggie-mp-room";
/** the user's own config while a race overrides it; survives reloads */
const SAVED_CONFIG_KEY = "puggie-mp-saved-config";

let startTimer: ReturnType<typeof setTimeout> | undefined;
let countdownTimer: ReturnType<typeof setInterval> | undefined;
let progressTimer: ReturnType<typeof setInterval> | undefined;
let lastProgress: ProgressPayload | undefined;
let raceStartedAt = 0;
/** where the server had us before a reload; progress never drops below it */
let resumeFloor: RacePosition | undefined;
let finishSent = false;
/** bumped per race so a stale async setup can bail out */
let raceToken = 0;
/** the hub shows the open rooms list */
let roomsWatched = false;
/** this socket asked for rooms:list (a new socket must ask again) */
let roomsSubscribed = false;
/** players we sent report:player for, oldest first; the server answers in order */
let pendingReports: string[] = [];

/** errors that end a queue:join that hasn't been answered yet */
const QUEUE_JOIN_ERRORS = new Set<ErrorCode>([
  "QUEUE_FULL",
  "RATE_LIMITED",
  "FEATURE_DISABLED",
  "AGE_REQUIRED",
]);
/** errors that answer a pending report:player */
const REPORT_ERRORS = new Set<ErrorCode>([
  "CANNOT_REPORT",
  "ALREADY_REPORTED",
  "PLAYER_NOT_FOUND",
  "NOT_IN_ROOM",
  "RATE_LIMITED",
  "FEATURE_DISABLED",
]);

/** room:create asked for an open room: list it once we're the host */
let openOnCreate = false;

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

export function connect(): void {
  client.connect();
}

export function createRoom(
  settings?: SettingsPatch,
  opts: { open?: boolean } = {},
): void {
  openOnCreate = opts.open === true && openRoomsOn();
  send({ type: "room:create", settings });
}

export function joinRoom(code: string): void {
  openOnCreate = false;
  send({ type: "room:join", code });
}

export function leaveRoom(): void {
  send({ type: "room:leave" });
  dropRoom();
}

/** host only: remove another player from the lobby (or results) */
export function kickPlayer(playerId: string): void {
  send({ type: "room:kick", playerId });
}

/** swap our server-assigned nickname for a new one (lobby only) */
export function rerollName(): void {
  send({ type: "player:reroll" });
}

/** pick a dog: saved for next time (and solo), sent to the room if in one */
export function setCharacter(character: Character): void {
  setSavedCharacter(character);
  if (room() !== undefined && characterSelectOn()) {
    send({ type: "player:character", character });
  }
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

/** host only: list (or unlist) our lobby in open rooms */
export function setRoomOpen(open: boolean): void {
  if (openRoomsOn()) send({ type: "room:setOpen", open });
}

/**
 * Quick Match: queue up (13+ only). `claimedWpm` is our recent pace, if we
 * have one. Needs both flags; a queue:matched later drops us into a room.
 */
export function joinQueue(claimedWpm?: number, agreedClientId?: string): void {
  if (!quickMatchOn() || !isAgeConfirmed() || queue() !== undefined) return;
  setQueue(startQueue(Date.now()));
  client.connect();
  // QM-009: prefer the id agreed across tabs by acquireClientId()
  const clientId = isValidClientId(agreedClientId)
    ? agreedClientId
    : (readStoredClientId() ?? getClientId());
  send(
    claimedWpm === undefined
      ? { type: "queue:join", clientId }
      : { type: "queue:join", claimedWpm, clientId },
  );
}

/** stop waiting for a Quick Match (no-op when not queued) */
export function leaveQueue(): void {
  if (queue() === undefined) return;
  setQueue(undefined);
  if (quickMatchOn()) send({ type: "queue:leave" });
}

/** report another human in our room for a preset reason (once per player) */
export function reportPlayer(playerId: string, reason: ReportReason): void {
  if (!reportOn() || reports().has(playerId)) return;
  const target = room()?.players.find((p) => p.id === playerId);
  if (target === undefined || target.isBot || playerId === myId()) return;
  pendingReports.push(playerId);
  setReportStatus(playerId, "sending");
  send({ type: "report:player", playerId, reason });
}

function setReportStatus(
  playerId: string,
  status: "sending" | "received" | undefined,
): void {
  const next = new Map(reports());
  if (status === undefined) next.delete(playerId);
  else next.set(playerId, status);
  setReports(next);
}

/** the server answered our oldest report: accepted (true) or refused */
function settleReport(received: boolean): void {
  const id = pendingReports.shift();
  if (id !== undefined) setReportStatus(id, received ? "received" : undefined);
}

/**
 * The hub is showing: subscribe to the open rooms list. Connects only with
 * the client flag on; asks only once the server said it has open rooms.
 */
export function watchOpenRooms(): void {
  if (!isFlagEnabled("openRooms")) return;
  roomsWatched = true;
  client.connect();
  requestRoomsList();
}

export function unwatchOpenRooms(): void {
  if (!roomsWatched) return;
  roomsWatched = false;
  setOpenRooms(undefined);
  if (roomsSubscribed && client.connected) {
    client.send({ type: "rooms:unsubscribe" });
  }
  roomsSubscribed = false;
}

function requestRoomsList(): void {
  // before welcome the features are unknown; the welcome handler retries
  if (!roomsWatched || roomsSubscribed || !client.connected) return;
  if (!openRoomsOn()) return;
  roomsSubscribed = true;
  client.send({ type: "rooms:list" });
}

/**
 * After a reload: rejoin the room this tab was in (the server keeps us for
 * 20 s), and put back config a race had overridden.
 */
export function resumeSession(): boolean {
  // a rejoined race re-applies its settings from a fresh snapshot
  restoreConfig();
  if (!MULTIPLAYER_ENABLED || !isAgeConfirmed()) return false;
  const code = sessionStorage.getItem(ROOM_KEY);
  if (code === null) return false;
  client.connect();
  // resends the snapshot if we're still in the room, errors (and clears the
  // stored code) if the grace period is over
  client.send({ type: "room:join", code });
  return true;
}

function send(msg: ClientMessage): void {
  setLastError(undefined);
  client.send(msg);
}

/** keep the race page's URL in step with the room: /r/CODE in one, else /race */
function syncRaceUrl(code: string | undefined): void {
  // also check the path: navigating away pushes the new URL before the page
  // transition ends, and that entry must not be overwritten
  if (
    getActivePage() !== "race" ||
    !RACE_PATH_RE.test(window.location.pathname)
  ) {
    return;
  }
  const path = code === undefined ? "/race" : `/r/${code}`;
  if (window.location.pathname !== path) {
    window.history.replaceState(window.history.state, "", path);
  }
}

/** forget the room locally (left, kicked out or session taken over) */
function dropRoom(): void {
  openOnCreate = false;
  const wasRacing = isRaceActive();
  sessionStorage.removeItem(ROOM_KEY);
  syncRaceUrl(undefined);
  endRace();
  pendingReports = [];
  batch(() => {
    setRoom(undefined);
    setResults(undefined);
    setReports(new Map());
  });
  // don't leave the race words on screen for a solo test
  if (wasRacing && getActivePage() === "test") void restart({ noAnim: true });
}

// ---------------------------------------------------------------- inbound

function handleMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "welcome":
      batch(() => {
        setMyId(msg.playerId);
        setServerFeatures(msg.features);
      });
      // a fresh socket: the old subscription is gone
      roomsSubscribed = false;
      requestRoomsList();
      // and so is our queue entry (a join still in flight is fine)
      if (queue()?.phase === "queued") {
        setQueue(undefined);
        showNoticeNotification(
          "Lost the connection, so you left the Quick Match queue.",
        );
      }
      pendingReports = [];
      return;
    case "queue:status":
      // ignore a status that crossed our queue:leave
      {
        const prev = queue();
        if (prev !== undefined) {
          setQueue(applyQueueStatus(msg, Date.now(), prev));
        }
      }
      return;
    case "queue:matched":
      // room:state and race:countdown follow and take it from here
      setQueue(undefined);
      return;
    case "queue:left":
      if (queue() !== undefined && msg.reason === "timeout") {
        showNoticeNotification("No match found. Try again in a bit.");
      }
      setQueue(undefined);
      return;
    case "report:received":
      settleReport(true);
      return;
    case "rooms:list":
      if (roomsWatched) setOpenRooms(parseRoomsList(msg));
      return;
    case "room:state": {
      const prev = room();
      if (prev?.code !== msg.code) {
        pendingReports = [];
        setReports(new Map());
      }
      setQueue(undefined);
      setRoom(withRoomDefaults(msg));
      sessionStorage.setItem(ROOM_KEY, msg.code);
      // the host lands here from /race: make the URL shareable and reloadable
      syncRaceUrl(msg.code);
      // the room we just created: list it right away
      if (openOnCreate && msg.hostId === myId()) {
        openOnCreate = false;
        if (!msg.open) setRoomOpen(true);
      }
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
      setResults(msg.results.map(withBotDefault));
      if (getActivePage() !== "race") goTo(`/r/${room()?.code ?? ""}`);
      return;
    case "error":
      setLastError(msg.message);
      openOnCreate = false;
      if (pendingReports.length > 0 && REPORT_ERRORS.has(msg.code)) {
        // already reported counts as done: the button stays settled
        settleReport(msg.code === "ALREADY_REPORTED");
        if (msg.code === "ALREADY_REPORTED") return;
      }
      if (queue()?.phase === "joining" && QUEUE_JOIN_ERRORS.has(msg.code)) {
        setQueue(undefined);
        if (msg.code === "RATE_LIMITED") {
          showNoticeNotification(
            "Too many Quick Match tries. Wait a minute and try again.",
          );
          return;
        }
      }
      if (
        msg.code === "ROOM_NOT_FOUND" ||
        msg.code === "ROOM_FULL" ||
        msg.code === "ROOM_IN_PROGRESS" ||
        msg.code === "KICKED"
      ) {
        sessionStorage.removeItem(ROOM_KEY);
        if (room() === undefined) syncRaceUrl(undefined);
      }
      if (msg.code !== "RATE_LIMITED") {
        showErrorNotification(`Multiplayer: ${msg.message}`);
      }
      return;
    case "room:kicked":
      dropRoom();
      showNoticeNotification("The host removed you from the lobby.");
      if (getActivePage() === "race") goTo("/race");
      return;
    case "room:closed":
      dropRoom();
      showNoticeNotification(
        "The lobby closed after an hour without activity.",
      );
      if (getActivePage() === "race") goTo("/race");
      return;
    case "pong":
      return;
  }
}

/** room:state from a server without open rooms (and so without bots) */
type LegacyRoomState = Omit<RoomState, "open" | "quickMatch" | "players"> & {
  open?: boolean;
  quickMatch?: boolean;
  players: (Omit<PlayerState, "isBot"> & { isBot?: boolean })[];
};

/** older servers omit the open rooms fields: private room, all humans */
function withRoomDefaults(msg: LegacyRoomState): RoomState {
  return {
    code: msg.code,
    hostId: msg.hostId,
    phase: msg.phase,
    settings: msg.settings,
    settingsVersion: msg.settingsVersion,
    open: msg.open === true,
    quickMatch: msg.quickMatch === true,
    players: msg.players.map(withBotDefault),
  };
}

function withBotDefault<T extends { isBot?: boolean }>(
  p: T,
): T & { isBot: boolean } {
  return { ...p, isBot: p.isBot === true };
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
  resumeFloor = undefined;
  batch(() => {
    setRace(info);
    setRaceFinished(false);
    setResults(undefined);
    setOpponentProgress([]);
    setCountdown(Math.max(0, Math.ceil((info.startAt - serverNow()) / 1000)));
  });
  onTestOrRaceStart();

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
    () => void goRace(token),
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

async function goRace(token: number): Promise<void> {
  if (token !== raceToken) return;
  // timers can fire a bit early; wait for the corrected clock
  const info = race();
  if (info === undefined) return;
  const left = info.startAt - serverNow();
  if (left > 0) {
    startTimer = setTimeout(() => void goRace(token), left);
    return;
  }
  clearInterval(countdownTimer);
  setCountdown(0);
  // run on the shared race clock: a rejoin after a reload lands mid-race
  raceStartedAt = performance.now() + left;
  if (!isTestActive()) startTest(raceStartedAt);
  const resume = ownServerPosition(info.words);
  // the timer's catch-up may have already ended a late rejoin
  if (resume !== undefined && isTestActive()) {
    resumeFloor = resume;
    await fastForward(info.words, resume);
    if (token !== raceToken) return;
  }
  setRaceInputLocked(false);
  focusWords(true);
  progressTimer = setInterval(sendProgress, PROGRESS_INTERVAL_MS);
}

/**
 * our position as the server last saw it (rejoin snapshot), if past the start.
 * charIndex is clamped to the word: extra letters aren't replayed.
 */
function ownServerPosition(words: readonly string[]): RacePosition | undefined {
  const id = myId();
  const candidates = [
    opponentProgress().find((p) => p.id === id),
    room()?.players.find((p) => p.id === id)?.progress,
  ];
  let best: RacePosition | undefined;
  for (const p of candidates) {
    if (p === undefined || (p.wordIndex === 0 && p.charIndex === 0)) continue;
    const pos = {
      wordIndex: p.wordIndex,
      charIndex: Math.min(p.charIndex, words[p.wordIndex]?.length ?? 0),
    };
    if (best === undefined || isBehind(best, pos)) best = pos;
  }
  return best;
}

/**
 * replay the race text up to a position through the engine, as typed input.
 * Real typing stays locked out: the lock only lifts for the synchronous lock
 * check at the start of each replayed insert.
 */
async function fastForward(
  words: readonly string[],
  to: RacePosition,
): Promise<void> {
  const token = raceToken;
  for (const data of resumeText(words, to.wordIndex, to.charIndex)) {
    if (token !== raceToken || finishSent || !isTestActive()) return;
    setRaceInputLocked(false);
    const inserted = emulateInsertText({
      data,
      now: performance.now(),
      automatic: true,
    });
    setRaceInputLocked(true);
    await inserted;
  }
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
  if (resumeFloor !== undefined && isBehind(next, resumeFloor)) return;
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
