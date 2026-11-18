import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ClientMessage,
  Phase,
  RoomState,
  ServerMessage,
} from "../../src/ts/multiplayer/protocol";

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
    get connected(): boolean {
      return true;
    }
    connect(): void {
      // messages are injected
    }
    send(msg: ClientMessage): void {
      fakeClient.sent.push(msg);
    }
    serverNow(): number {
      return Date.now();
    }
  },
}));
const clientFlags = vi.hoisted(() => new Set<string>());
vi.mock("../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: (flag: string) => clientFlags.has(flag),
}));
vi.mock("../../src/ts/config/store", () => ({ Config: {} }));
vi.mock("../../src/ts/config/setters", () => ({ setConfig: () => true }));
vi.mock("../../src/ts/config/persistence", () => ({
  saveFullConfigToLocalStorage: vi.fn(),
}));
vi.mock("../../src/ts/events/navigation", () => ({
  navigationEvent: { dispatch: vi.fn() },
}));
vi.mock("../../src/ts/states/core", () => ({ getActivePage: () => "test" }));
const notify = vi.hoisted(() => ({ error: vi.fn(), notice: vi.fn() }));
vi.mock("../../src/ts/states/notifications", () => ({
  showErrorNotification: notify.error,
  showNoticeNotification: notify.notice,
}));
vi.mock("../../src/ts/states/test", () => ({
  getActiveWordIndex: () => 0,
  isResultCalculating: () => false,
  isTestActive: () => false,
  isTestRestarting: () => false,
}));
vi.mock("../../src/ts/test/events/data", () => ({
  getCurrentInput: () => "",
}));
vi.mock("../../src/ts/test/events/live-cache", () => ({
  getLiveCachedIncorrectInputs: () => 0,
}));
vi.mock("../../src/ts/test/test-logic", () => ({
  restart: vi.fn(async () => undefined),
  startTest: vi.fn(() => true),
  stop: vi.fn(),
}));
vi.mock("../../src/ts/input/handlers/insert-text", () => ({
  emulateInsertText: vi.fn(async () => undefined),
}));
vi.mock("../../src/ts/test/test-ui", () => ({
  focusWords: vi.fn(),
  isMounted: () => true,
}));
vi.mock("../../src/ts/test/test-words", () => ({
  words: { get: () => ({ text: "the" }) },
}));

const Race = await import("../../src/ts/multiplayer/race");
const Store = await import("../../src/ts/multiplayer/store");

function receive(msg: ServerMessage): void {
  fakeClient.handlers?.onMessage(msg);
}

function welcome(quickChat: boolean | undefined): ServerMessage {
  return {
    type: "welcome",
    playerId: "me",
    sessionToken: "t",
    name: "ZippyPug42",
    protocol: 1,
    features: {
      characterSelect: false,
      openRooms: false,
      quickMatch: false,
      report: false,
      ...(quickChat === undefined ? {} : { quickChat }),
    },
  };
}

const player = (id: string, isBot = false): RoomState["players"][number] => ({
  id,
  name: isBot ? "Pug Bot · ~80 wpm" : `${id}Pug`,
  isBot,
  color: "opp1",
  ready: false,
  inLobby: false,
  connected: true,
  character: "puggie",
  progress: { wordIndex: 0, charIndex: 0, testMs: 0, wpm: 0 },
  finished: false,
});

function roomState(overrides: Partial<RoomState> = {}): ServerMessage {
  return {
    type: "room:state",
    code: "ABC234",
    hostId: "me",
    phase: "lobby",
    settings: {
      mode: "words",
      mode2: 10,
      punctuation: false,
      numbers: false,
      language: "english",
    },
    settingsVersion: 1,
    open: false,
    quickMatch: false,
    players: [player("me"), player("them"), player("bot1", true)],
    ...overrides,
  };
}

function relay(playerId: unknown, presetId: unknown): void {
  receive({ type: "chat:preset", playerId, presetId } as ServerMessage);
}

const chatsSent = (): ClientMessage[] =>
  fakeClient.sent.filter((m) => m.type === "chat:preset");
const feedIds = (): string[] =>
  Store.quickChatFeed().map((e) => `${e.playerId}:${e.presetId}`);

describe("quick-chat in race.ts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    localStorage.clear();
    clientFlags.clear();
    clientFlags.add("quickChat");
    Store.setMutedPlayersSignal(new Set<string>());
    Store.setQuickChatHiddenSignal(false);
    receive(welcome(true));
    receive(roomState());
    fakeClient.sent = [];
    notify.error.mockClear();
    notify.notice.mockClear();
  });
  afterEach(() => {
    Race.leaveRoom();
    vi.useRealTimers();
  });

  describe("sendQuickChat", () => {
    it("sends exactly {type, presetId}", () => {
      expect(Race.sendQuickChat("gg")).toBe(true);
      expect(chatsSent()).toEqual([{ type: "chat:preset", presetId: "gg" }]);
      expect(Object.keys(chatsSent()[0] ?? {}).sort()).toEqual([
        "presetId",
        "type",
      ]);
    });

    it("is a no-op unless the server feature is on", () => {
      for (const quickChat of [false, undefined]) {
        receive(welcome(quickChat));
        expect(Race.sendQuickChat("gg")).toBe(false);
      }
      expect(chatsSent()).toEqual([]);
    });

    it("is a no-op with the client flag off", () => {
      clientFlags.clear();
      expect(Race.sendQuickChat("gg")).toBe(false);
      expect(chatsSent()).toEqual([]);
    });

    it("is a no-op outside a private room", () => {
      receive(roomState({ open: true }));
      expect(Race.sendQuickChat("gg")).toBe(false);
      receive(roomState({ quickMatch: true }));
      expect(Race.sendQuickChat("gg")).toBe(false);
      Race.leaveRoom();
      fakeClient.sent = [];
      expect(Race.sendQuickChat("gg")).toBe(false);
      expect(chatsSent()).toEqual([]);
    });

    it("works in lobby and results only", () => {
      const cases: [Phase, boolean][] = [
        ["countdown", false],
        ["racing", false],
        ["results", true],
        ["lobby", true],
      ];
      for (const [phase, ok] of cases) {
        receive(roomState({ phase }));
        vi.advanceTimersByTime(5000);
        expect(Race.sendQuickChat(ok ? "gg" : "thanks")).toBe(ok);
      }
      expect(chatsSent()).toHaveLength(2);
    });

    it("is a no-op while hidden", () => {
      Race.setQuickChatHidden(true);
      expect(Race.sendQuickChat("gg")).toBe(false);
      expect(chatsSent()).toEqual([]);
    });

    it("rejects ids off the whitelist", () => {
      expect(Race.sendQuickChat("e-peace" as "gg")).toBe(false);
      expect(chatsSent()).toEqual([]);
    });

    it("a second send inside the 1.2s gap is a no-op", () => {
      expect(Race.sendQuickChat("gg")).toBe(true);
      expect(Store.quickChatCooldownUntil()).toBe(Date.now() + 1200);
      vi.advanceTimersByTime(1199);
      expect(Race.sendQuickChat("thanks")).toBe(false);
      expect(chatsSent()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(Store.quickChatCooldownUntil()).toBe(0);
      expect(Race.sendQuickChat("thanks")).toBe(true);
      expect(chatsSent()).toHaveLength(2);
    });

    it("locks the same id for 4s", () => {
      Race.sendQuickChat("gg");
      expect(Store.quickChatRepeatLocked().has("gg")).toBe(true);
      vi.advanceTimersByTime(2000);
      expect(Race.sendQuickChat("gg")).toBe(false);
      vi.advanceTimersByTime(2000);
      expect(Store.quickChatRepeatLocked().has("gg")).toBe(false);
      expect(Race.sendQuickChat("gg")).toBe(true);
    });
  });

  describe("incoming chat:preset", () => {
    it("lands in the feed and latest", () => {
      relay("them", "gg");
      relay("me", "e-heart");
      expect(feedIds()).toEqual(["them:gg", "me:e-heart"]);
      expect(Store.quickChatLatest().get("them")?.presetId).toBe("gg");
    });

    it("keeps the 5 newest", () => {
      const ids = ["hello", "gg", "thanks", "brb", "ready", "rematch"] as const;
      for (const id of ids) relay("them", id);
      expect(Store.quickChatFeed().map((e) => e.presetId)).toEqual(
        ids.slice(1),
      );
    });

    it("drops unknown preset ids and unknown or bot senders", () => {
      relay("them", "e-peace");
      relay("them", "__proto__");
      relay("them", 5);
      relay("nobody", "gg");
      relay("bot1", "gg");
      relay(42, "gg");
      expect(Store.quickChatFeed()).toEqual([]);
      expect(Store.quickChatLatest().size).toBe(0);
    });

    it("drops relays when not allowed (flag off, open room, racing, hidden)", () => {
      receive(welcome(false));
      relay("them", "gg");
      receive(welcome(true));
      receive(roomState({ phase: "racing" }));
      relay("them", "gg");
      receive(roomState({ phase: "lobby", open: true }));
      relay("them", "gg");
      receive(roomState());
      Race.setQuickChatHidden(true);
      relay("them", "gg");
      expect(Store.quickChatFeed()).toEqual([]);
      Race.setQuickChatHidden(false);
      relay("them", "gg");
      expect(feedIds()).toEqual(["them:gg"]);
    });

    it("drops muted senders, clears what they said and persists the mute", () => {
      relay("them", "gg");
      Race.toggleQuickChatMute("them");
      expect(Store.quickChatFeed()).toEqual([]);
      expect(Store.quickChatLatest().has("them")).toBe(false);
      expect(sessionStorage.getItem("puggie-qc-muted")).toBe('["them"]');
      relay("them", "thanks");
      expect(Store.quickChatFeed()).toEqual([]);
      Race.toggleQuickChatMute("them");
      expect(sessionStorage.getItem("puggie-qc-muted")).toBe("[]");
      relay("them", "thanks");
      expect(feedIds()).toEqual(["them:thanks"]);
    });

    it("hiding clears the feed and persists in localStorage", () => {
      relay("them", "gg");
      Race.setQuickChatHidden(true);
      expect(Store.quickChatFeed()).toEqual([]);
      expect(Store.quickChatLatest().size).toBe(0);
      expect(localStorage.getItem("puggie-qc-hidden")).toBe("1");
      Race.setQuickChatHidden(false);
      expect(localStorage.getItem("puggie-qc-hidden")).toBeNull();
    });

    it("a new countdown clears the badges but keeps the feed", () => {
      relay("them", "gg");
      receive(roomState({ phase: "countdown" }));
      expect(Store.quickChatLatest().size).toBe(0);
      expect(feedIds()).toEqual(["them:gg"]);
    });
  });

  describe("errors", () => {
    for (const code of ["RATE_LIMITED", "WRONG_PHASE"] as const) {
      it(`${code} after a send is consumed silently`, () => {
        Race.sendQuickChat("gg");
        receive({ type: "error", code, message: "nope" });
        expect(notify.error).not.toHaveBeenCalled();
        expect(Store.quickChatSlowHint()).toBe(code === "RATE_LIMITED");
      });
    }

    it("the slow hint clears itself", () => {
      Race.sendQuickChat("gg");
      receive({ type: "error", code: "RATE_LIMITED", message: "slow" });
      expect(Store.quickChatSlowHint()).toBe(true);
      vi.advanceTimersByTime(3000);
      expect(Store.quickChatSlowHint()).toBe(false);
    });

    it("only one error per pending send is swallowed", () => {
      Race.sendQuickChat("gg");
      receive({ type: "error", code: "WRONG_PHASE", message: "a" });
      receive({ type: "error", code: "WRONG_PHASE", message: "b" });
      expect(notify.error).toHaveBeenCalledTimes(1);
      expect(notify.error).toHaveBeenCalledWith("Multiplayer: b");
    });

    it("our own relay settles the send, so a later error is not swallowed", () => {
      Race.sendQuickChat("gg");
      relay("me", "gg");
      receive({ type: "error", code: "WRONG_PHASE", message: "late" });
      expect(notify.error).toHaveBeenCalledWith("Multiplayer: late");
    });

    it("WRONG_PHASE without a pending send still notifies", () => {
      receive({ type: "error", code: "WRONG_PHASE", message: "x" });
      expect(notify.error).toHaveBeenCalledTimes(1);
      expect(Store.quickChatSlowHint()).toBe(false);
    });
  });

  it("ignores unknown server frame types", () => {
    relay("them", "gg");
    expect(() =>
      receive({ type: "chat:text", text: "hi" } as unknown as ServerMessage),
    ).not.toThrow();
    expect(feedIds()).toEqual(["them:gg"]);
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("a room code change clears the feed and cooldown", () => {
    relay("them", "gg");
    Race.sendQuickChat("gg");
    receive(roomState({ code: "XYZ789" }));
    expect(Store.quickChatFeed()).toEqual([]);
    expect(Store.quickChatLatest().size).toBe(0);
    expect(Store.quickChatCooldownUntil()).toBe(0);
    expect(Store.quickChatRepeatLocked().size).toBe(0);
  });

  it("the same room code keeps the feed", () => {
    relay("them", "gg");
    receive(roomState({ phase: "results" }));
    expect(feedIds()).toEqual(["them:gg"]);
  });

  it("leaving clears the feed", () => {
    relay("them", "gg");
    Race.leaveRoom();
    expect(Store.quickChatFeed()).toEqual([]);
    expect(Store.quickChatLatest().size).toBe(0);
  });

  it("is hidden in the kids flow", () => {
    expect(Store.quickChatAvailableNow()).toBe(true);
    sessionStorage.setItem("puggie-kids-flow", "1");
    expect(Store.kidsFlow()).toBe(true);
    expect(Store.quickChatAvailableNow()).toBe(false);
    expect(Race.sendQuickChat("gg")).toBe(false);
    relay("them", "gg");
    expect(chatsSent()).toEqual([]);
    expect(Store.quickChatFeed()).toEqual([]);
  });
});
