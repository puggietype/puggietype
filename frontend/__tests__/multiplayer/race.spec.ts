import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ClientMessage,
  RoomState,
  ServerMessage,
} from "../../src/ts/multiplayer/protocol";

// ---- mocked engine + app surroundings

const engine = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  testActive: false,
  resultCalculating: false,
  firstWord: undefined as string | undefined,
  restart: vi.fn(async () => undefined),
  startTest: vi.fn(() => true),
  stop: vi.fn(),
  navigate: vi.fn(),
  saveFull: vi.fn(),
}));

const fakeClient = vi.hoisted(() => ({
  sent: [] as ClientMessage[],
  handlers: undefined as
    | {
        onMessage: (m: ServerMessage) => void;
        onTerminated: (code: number) => void;
      }
    | undefined,
}));

vi.mock("../../src/ts/multiplayer/client", () => ({
  MultiplayerClient: class {
    constructor(handlers: typeof fakeClient.handlers) {
      fakeClient.handlers = handlers;
    }
    connect(): void {
      // connection is irrelevant here, messages are injected
    }
    send(msg: ClientMessage): void {
      fakeClient.sent.push(msg);
    }
    serverNow(): number {
      return Date.now();
    }
  },
}));
vi.mock("../../src/ts/config/store", () => ({ Config: engine.config }));
vi.mock("../../src/ts/config/setters", () => ({
  setConfig: (key: string, value: unknown) => {
    engine.config[key] = value;
    return true;
  },
}));
vi.mock("../../src/ts/config/persistence", () => ({
  saveFullConfigToLocalStorage: engine.saveFull,
}));
vi.mock("../../src/ts/events/navigation", () => ({
  navigationEvent: { dispatch: engine.navigate },
}));
vi.mock("../../src/ts/states/core", () => ({ getActivePage: () => "test" }));
vi.mock("../../src/ts/states/notifications", () => ({
  showErrorNotification: vi.fn(),
  showNoticeNotification: vi.fn(),
}));
vi.mock("../../src/ts/states/test", () => ({
  getActiveWordIndex: () => 0,
  isResultCalculating: () => engine.resultCalculating,
  isTestActive: () => engine.testActive,
  isTestRestarting: () => false,
}));
vi.mock("../../src/ts/test/events/data", () => ({
  getCurrentInput: () => "",
}));
vi.mock("../../src/ts/test/events/live-cache", () => ({
  getLiveCachedIncorrectInputs: () => 0,
}));
vi.mock("../../src/ts/test/test-logic", () => ({
  restart: engine.restart,
  startTest: engine.startTest,
  stop: engine.stop,
}));
vi.mock("../../src/ts/test/test-ui", () => ({
  focusWords: vi.fn(),
  isMounted: () => true,
}));
vi.mock("../../src/ts/test/test-words", () => ({
  words: { get: () => ({ text: engine.firstWord }) },
}));

const Race = await import("../../src/ts/multiplayer/race");
const Hooks = await import("../../src/ts/multiplayer/engine-hooks");
const Store = await import("../../src/ts/multiplayer/store");

// ---- helpers

const USER_CONFIG = {
  funbox: ["mirror"],
  lazyMode: true,
  difficulty: "master",
  minWpm: "custom",
  minAcc: "off",
  minBurst: "off",
  stopOnError: "word",
  mode: "quote",
  time: 60,
  words: 50,
  punctuation: false,
  numbers: true,
  language: "german",
};

const WORDS = ["the", "quick", "fox"];

function receive(msg: ServerMessage): void {
  fakeClient.handlers?.onMessage(msg);
}

function roomState(overrides: Partial<RoomState> = {}): ServerMessage {
  return {
    type: "room:state",
    code: "ABC234",
    hostId: "me",
    phase: "lobby",
    settings: {
      mode: "words",
      mode2: 10,
      punctuation: true,
      numbers: false,
      language: "english",
    },
    settingsVersion: 1,
    players: [
      {
        id: "me",
        name: "me",
        color: "opp1",
        ready: true,
        connected: true,
        progress: { wordIndex: 0, charIndex: 0, testMs: 0, wpm: 0 },
        finished: false,
      },
    ],
    ...overrides,
  };
}

function countdown(startAt = Date.now() + 3500): ServerMessage {
  return {
    type: "race:countdown",
    startAt,
    words: WORDS,
    settings: {
      mode: "words",
      mode2: 10,
      punctuation: true,
      numbers: false,
      language: "english",
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0);
}

async function startCountdown(startAt?: number): Promise<void> {
  receive({
    type: "welcome",
    playerId: "me",
    sessionToken: "t",
    name: "ZippyPug42",
    protocol: 1,
  });
  receive(roomState({ phase: "countdown" }));
  receive(countdown(startAt));
  await flush();
}

describe("race lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    Object.assign(engine.config, structuredClone(USER_CONFIG));
    engine.testActive = false;
    engine.resultCalculating = false;
    engine.firstWord = WORDS[0];
    engine.restart.mockClear();
    engine.startTest.mockClear();
    engine.stop.mockClear();
    engine.navigate.mockClear();
    engine.saveFull.mockClear();
    fakeClient.sent = [];
  });
  afterEach(() => {
    Race.leaveRoom();
    vi.useRealTimers();
  });

  it("applies room settings, feeds the words and locks input on countdown", async () => {
    await startCountdown();
    expect(engine.config).toMatchObject({
      mode: "words",
      words: 10,
      punctuation: true,
      numbers: false,
      language: "english",
      funbox: [],
      lazyMode: false,
      difficulty: "normal",
      stopOnError: "off",
    });
    expect(Hooks.getRaceWord(1)).toBe("quick");
    expect(Hooks.isRaceInputLocked()).toBe(true);
    expect(Hooks.isRaceRestartLocked()).toBe(true);
    expect(engine.restart).toHaveBeenCalledTimes(1);
  });

  it("unlocks input and starts the test at startAt", async () => {
    await startCountdown(Date.now() + 3000);
    expect(engine.startTest).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(Hooks.isRaceInputLocked()).toBe(false);
    expect(engine.startTest).toHaveBeenCalledTimes(1);
    expect(Store.countdown()).toBe(0);
  });

  it("ignores the countdown a reconnect re-sends", async () => {
    const startAt = Date.now() + 3000;
    await startCountdown(startAt);
    receive(countdown(startAt));
    await flush();
    expect(engine.restart).toHaveBeenCalledTimes(1);
  });

  it("only waits after a reload when the server says we finished", async () => {
    receive({
      type: "welcome",
      playerId: "me",
      sessionToken: "t",
      name: "ZippyPug42",
      protocol: 1,
    });
    const state = roomState({ phase: "racing" });
    const me = state.type === "room:state" ? state.players[0] : undefined;
    if (me !== undefined) me.finished = true;
    receive(state);
    receive(countdown());
    await flush();
    expect(engine.restart).not.toHaveBeenCalled();
    expect(Store.raceFinished()).toBe(true);
  });

  it("sends the finish without separators and restores config", async () => {
    await startCountdown(Date.now());
    await vi.advanceTimersByTimeAsync(0);
    const taken = Hooks.handleRaceFinish({
      wpm: 80,
      raw: 82,
      acc: 98,
      testMs: 4000,
      input: ["the ", "quick ", "fox"],
      keyCount: 15,
    });
    expect(taken).toBe(true);
    expect(fakeClient.sent.at(-1)).toEqual({
      type: "race:finish",
      wpm: 80,
      raw: 82,
      acc: 98,
      testMs: 4000,
      input: ["the", "quick", "fox"],
      keyCount: 15,
    });
    expect(Hooks.isRaceActive()).toBe(false);
    expect(engine.config).toMatchObject(USER_CONFIG);
    expect(engine.saveFull).toHaveBeenCalledTimes(1);
    expect(engine.navigate).toHaveBeenLastCalledWith({
      url: "/r/ABC234",
      options: { force: true },
    });
    expect(Store.raceFinished()).toBe(true);
  });

  it("stops a running test when results arrive first, so nothing is saved", async () => {
    await startCountdown(Date.now());
    engine.testActive = true;
    receive({ type: "race:results", results: [] });
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(Hooks.isRaceActive()).toBe(false);
    expect(engine.config).toMatchObject(USER_CONFIG);
    expect(Store.race()).toBeUndefined();
  });

  it("swallows a result that was mid-calculation when the race ended", async () => {
    await startCountdown(Date.now());
    engine.resultCalculating = true;
    receive({ type: "race:results", results: [] });
    const finish = {
      wpm: 1,
      raw: 1,
      acc: 100,
      testMs: 1,
      input: [],
      keyCount: 0,
    };
    expect(Hooks.handleRaceFinish(finish)).toBe(true);
    expect(fakeClient.sent.map((m) => m.type)).not.toContain("race:finish");
    // only once: the next solo test is a normal test again
    expect(Hooks.handleRaceFinish(finish)).toBe(false);
  });

  it("aborts when the engine didn't load the race words", async () => {
    engine.firstWord = "solo";
    await startCountdown();
    expect(fakeClient.sent.at(-1)).toEqual({ type: "room:leave" });
    expect(Hooks.isRaceActive()).toBe(false);
    expect(Store.room()).toBeUndefined();
    expect(engine.config).toMatchObject(USER_CONFIG);
  });

  it("aborts for a language this client doesn't know", async () => {
    receive({
      type: "welcome",
      playerId: "me",
      sessionToken: "t",
      name: "ZippyPug42",
      protocol: 1,
    });
    receive(roomState({ phase: "countdown" }));
    const msg = countdown();
    if (msg.type === "race:countdown") msg.settings.language = "not_a_language";
    receive(msg);
    await flush();
    expect(fakeClient.sent.at(-1)).toEqual({ type: "room:leave" });
    expect(engine.config).toMatchObject(USER_CONFIG);
  });

  it("forgets the room when another tab takes the session over", async () => {
    await startCountdown();
    fakeClient.handlers?.onTerminated(4000);
    expect(Store.room()).toBeUndefined();
    expect(Hooks.isRaceActive()).toBe(false);
    expect(engine.config).toMatchObject(USER_CONFIG);
  });

  it("returns to the lobby on rematch", async () => {
    await startCountdown(Date.now());
    receive({ type: "race:results", results: [] });
    receive(roomState({ phase: "results" }));
    receive(roomState({ phase: "lobby" }));
    expect(Store.results()).toBeUndefined();
    expect(Store.race()).toBeUndefined();
  });

  it("regenerates the test after leaving mid-race on the test page", async () => {
    await startCountdown(Date.now());
    engine.restart.mockClear();
    Race.leaveRoom();
    await flush();
    expect(engine.restart).toHaveBeenCalledTimes(1);
    expect(Hooks.isRaceActive()).toBe(false);
  });

  it("restores a stale snapshot and rejoins on resume", async () => {
    await startCountdown();
    // simulate a reload: the snapshot and room code survive in sessionStorage
    const saved = {
      room: sessionStorage.getItem("puggie-mp-room"),
      config: sessionStorage.getItem("puggie-mp-saved-config"),
    };
    Race.leaveRoom();
    sessionStorage.setItem("puggie-mp-room", saved.room ?? "");
    sessionStorage.setItem("puggie-mp-saved-config", saved.config ?? "");
    engine.config["language"] = "english";
    fakeClient.sent = [];
    expect(Race.resumeSession()).toBe(true);
    expect(engine.config).toMatchObject(USER_CONFIG);
    expect(fakeClient.sent).toEqual([{ type: "room:join", code: "ABC234" }]);
    receive({ type: "error", code: "ROOM_IN_PROGRESS", message: "x" });
    expect(sessionStorage.getItem("puggie-mp-room")).toBeNull();
  });

  it("lets a pending discard expire", () => {
    Hooks.discardPendingRaceFinish();
    vi.advanceTimersByTime(11_000);
    expect(
      Hooks.handleRaceFinish({
        wpm: 1,
        raw: 1,
        acc: 100,
        testMs: 1,
        input: [],
        keyCount: 0,
      }),
    ).toBe(false);
  });

  it("asks the server for a new nickname", () => {
    fakeClient.sent = [];
    Race.rerollName();
    expect(fakeClient.sent).toEqual([{ type: "player:reroll" }]);
  });
});
