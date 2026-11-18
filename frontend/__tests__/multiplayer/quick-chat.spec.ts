import { describe, expect, it } from "vitest";

import type { Phase } from "../../src/ts/multiplayer/protocol";
import {
  appendFeed,
  canSendQuickChat,
  loadHidden,
  loadMuted,
  QUICK_CHAT_EMOTE_ITEMS,
  QUICK_CHAT_FEED_MAX,
  QUICK_CHAT_HIDDEN_KEY,
  QUICK_CHAT_ITEMS,
  QUICK_CHAT_LINE_ITEMS,
  QUICK_CHAT_MUTED_KEY,
  QUICK_CHAT_MUTED_MAX,
  quickChatAnnouncement,
  quickChatAvailable,
  quickChatWaitMs,
  saveHidden,
  saveMuted,
  shouldShowRelay,
  toggleMuted,
  type QuickChatContext,
  type QuickChatEntry,
  type RelayCheck,
} from "../../src/ts/multiplayer/quick-chat";
import {
  QUICK_CHAT_EMOTES,
  QUICK_CHAT_ID_MAX_LENGTH,
  QUICK_CHAT_ID_PATTERN,
  QUICK_CHAT_IDS,
  QUICK_CHAT_LIMIT,
  QUICK_CHAT_LINES,
  QUICK_CHAT_MIN_GAP_MS,
  QUICK_CHAT_REPEAT_MS,
  QUICK_CHAT_ROOM_LIMIT,
  QUICK_CHAT_ROOM_WINDOW_MS,
  QUICK_CHAT_WINDOW_MS,
} from "../../src/ts/multiplayer/quick-chat-presets";

type MemoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  data: Map<string, string>;
};

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const throwing: MemoryStorage = {
  data: new Map(),
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const ctx = (over: Partial<QuickChatContext> = {}): QuickChatContext => ({
  on: true,
  kids: false,
  room: { quickMatch: false, open: false, phase: "lobby" },
  hidden: false,
  ...over,
});

const room = (
  over: Partial<NonNullable<QuickChatContext["room"]>> = {},
): QuickChatContext["room"] => ({
  quickMatch: false,
  open: false,
  phase: "lobby",
  ...over,
});

describe("preset parity with the server list", () => {
  it("ids are exactly the reviewed list", () => {
    expect([...QUICK_CHAT_LINES]).toEqual([
      "hello",
      "have-fun",
      "good-luck",
      "ready",
      "one-sec",
      "brb",
      "gg",
      "nice-race",
      "close-one",
      "that-was-fun",
      "thanks",
      "rematch",
      "one-more",
      "bye-for-now",
    ]);
    expect([...QUICK_CHAT_EMOTES]).toEqual([
      "e-paw",
      "e-heart",
      "e-thumbs-up",
      "e-smile",
      "e-wow",
      "e-treat",
      "e-handshake",
      "e-woof",
    ]);
    expect([...QUICK_CHAT_IDS]).toEqual([
      ...QUICK_CHAT_LINES,
      ...QUICK_CHAT_EMOTES,
    ]);
  });

  it("limits match the server", () => {
    expect(QUICK_CHAT_LIMIT).toBe(5);
    expect(QUICK_CHAT_WINDOW_MS).toBe(10000);
    expect(QUICK_CHAT_MIN_GAP_MS).toBe(1200);
    expect(QUICK_CHAT_REPEAT_MS).toBe(4000);
    expect(QUICK_CHAT_ROOM_LIMIT).toBe(16);
    expect(QUICK_CHAT_ROOM_WINDOW_MS).toBe(10000);
    expect(QUICK_CHAT_ID_MAX_LENGTH).toBe(24);
  });

  it("every id matches the id pattern and emote ids start with e-", () => {
    for (const id of QUICK_CHAT_IDS) {
      expect(id).toMatch(QUICK_CHAT_ID_PATTERN);
      expect(id.length).toBeLessThanOrEqual(QUICK_CHAT_ID_MAX_LENGTH);
    }
    expect(QUICK_CHAT_EMOTES.every((id) => id.startsWith("e-"))).toBe(true);
    expect(QUICK_CHAT_LINES.some((id) => id.startsWith("e-"))).toBe(false);
  });
});

describe("QUICK_CHAT_ITEMS", () => {
  it("covers exactly the whitelisted ids", () => {
    expect(Object.keys(QUICK_CHAT_ITEMS).sort()).toEqual(
      [...QUICK_CHAT_LINES, ...QUICK_CHAT_EMOTES].sort(),
    );
    expect(QUICK_CHAT_LINE_ITEMS).toHaveLength(14);
    expect(QUICK_CHAT_EMOTE_ITEMS).toHaveLength(8);
    expect(QUICK_CHAT_LINE_ITEMS.map((i) => i.id)).toEqual([
      ...QUICK_CHAT_LINES,
    ]);
    expect(QUICK_CHAT_EMOTE_ITEMS.map((i) => i.id)).toEqual([
      ...QUICK_CHAT_EMOTES,
    ]);
  });

  it("has e-handshake with fa-handshake and no e-peace", () => {
    expect(QUICK_CHAT_ITEMS["e-handshake"]).toEqual({
      id: "e-handshake",
      kind: "emote",
      text: "handshake",
      icon: "fa-handshake",
    });
    expect("e-peace" in QUICK_CHAT_ITEMS).toBe(false);
  });

  it("each item has its id, kind, short lowercase text; emotes have an icon", () => {
    for (const [id, item] of Object.entries(QUICK_CHAT_ITEMS)) {
      expect(item.id).toBe(id);
      expect(item.text.trim()).not.toBe("");
      expect(item.text.length).toBeLessThanOrEqual(24);
      expect(item.text).toBe(item.text.toLowerCase());
      if (item.kind === "emote") {
        expect(item.icon).toMatch(/^fa-[a-z-]+$/);
      } else {
        expect(item.kind).toBe("line");
        expect(item.icon).toBeUndefined();
      }
    }
  });
});

describe("visibility", () => {
  it("quickChatAvailable: private rooms only, flag on, not kids", () => {
    expect(quickChatAvailable(ctx())).toBe(true);
    expect(quickChatAvailable(ctx({ on: false }))).toBe(false);
    expect(quickChatAvailable(ctx({ kids: true }))).toBe(false);
    expect(quickChatAvailable(ctx({ room: undefined }))).toBe(false);
    expect(quickChatAvailable(ctx({ room: room({ quickMatch: true }) }))).toBe(
      false,
    );
    expect(quickChatAvailable(ctx({ room: room({ open: true }) }))).toBe(false);
    // hidden still counts as available (the panel shows its switch)
    expect(quickChatAvailable(ctx({ hidden: true }))).toBe(true);
    expect(quickChatAvailable(ctx({ room: room({ phase: "racing" }) }))).toBe(
      true,
    );
  });

  it("canSendQuickChat: also not hidden, lobby/results only", () => {
    expect(canSendQuickChat(ctx())).toBe(true);
    expect(canSendQuickChat(ctx({ on: false }))).toBe(false);
    expect(canSendQuickChat(ctx({ kids: true }))).toBe(false);
    expect(canSendQuickChat(ctx({ room: undefined }))).toBe(false);
    expect(canSendQuickChat(ctx({ room: room({ quickMatch: true }) }))).toBe(
      false,
    );
    expect(canSendQuickChat(ctx({ room: room({ open: true }) }))).toBe(false);
    expect(canSendQuickChat(ctx({ hidden: true }))).toBe(false);
    const phases: [Phase, boolean][] = [
      ["lobby", true],
      ["results", true],
      ["countdown", false],
      ["racing", false],
    ];
    for (const [phase, ok] of phases) {
      expect(canSendQuickChat(ctx({ room: room({ phase }) }))).toBe(ok);
    }
  });
});

describe("shouldShowRelay", () => {
  const check = (over: Partial<RelayCheck> = {}): RelayCheck => ({
    ctx: ctx(),
    playerId: "them",
    presetId: "gg",
    humanIds: new Set(["me", "them"]),
    muted: new Set(),
    ...over,
  });

  it("shows a known id from a human in the room", () => {
    expect(shouldShowRelay(check())).toBe(true);
    expect(shouldShowRelay(check({ playerId: "me" }))).toBe(true);
  });

  it("drops unknown or non-string preset ids", () => {
    for (const presetId of [
      "e-peace",
      "GG",
      "gg ",
      "constructor",
      "__proto__",
      "",
      42,
      null,
      undefined,
      { id: "gg" },
      ["gg"],
    ]) {
      expect(shouldShowRelay(check({ presetId }))).toBe(false);
    }
  });

  it("drops senders not among the humans (bots, strangers, non-strings)", () => {
    for (const playerId of ["bot1", "nobody", 7, null, undefined, {}]) {
      expect(shouldShowRelay(check({ playerId }))).toBe(false);
    }
  });

  it("drops muted senders", () => {
    expect(shouldShowRelay(check({ muted: new Set(["them"]) }))).toBe(false);
  });

  it("drops everything while hidden or outside lobby/results", () => {
    expect(shouldShowRelay(check({ ctx: ctx({ hidden: true }) }))).toBe(false);
    expect(
      shouldShowRelay(check({ ctx: ctx({ room: room({ phase: "racing" }) }) })),
    ).toBe(false);
    expect(shouldShowRelay(check({ ctx: ctx({ kids: true }) }))).toBe(false);
  });
});

describe("appendFeed", () => {
  const entry = (seq: number): QuickChatEntry => ({
    seq,
    playerId: "p",
    presetId: "gg",
    at: seq,
  });

  it("keeps the 5 newest, newest last", () => {
    expect(QUICK_CHAT_FEED_MAX).toBe(5);
    let feed: QuickChatEntry[] = [];
    for (let i = 1; i <= 8; i++) feed = appendFeed(feed, entry(i));
    expect(feed.map((e) => e.seq)).toEqual([4, 5, 6, 7, 8]);
  });

  it("does not mutate the input", () => {
    const feed = [entry(1)];
    appendFeed(feed, entry(2));
    expect(feed).toHaveLength(1);
  });
});

describe("muted storage", () => {
  it("round-trips under puggie-qc-muted", () => {
    expect(QUICK_CHAT_MUTED_KEY).toBe("puggie-qc-muted");
    const s = memoryStorage();
    saveMuted(s, ["a", "b"]);
    expect(s.data.get("puggie-qc-muted")).toBe('["a","b"]');
    expect(loadMuted(s)).toEqual(["a", "b"]);
  });

  it("caps at 32, keeping the newest", () => {
    expect(QUICK_CHAT_MUTED_MAX).toBe(32);
    const ids = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const s = memoryStorage();
    saveMuted(s, ids);
    expect(loadMuted(s)).toEqual(ids.slice(-32));
    const raw = memoryStorage({ "puggie-qc-muted": JSON.stringify(ids) });
    expect(loadMuted(raw)).toEqual(ids.slice(-32));
  });

  it("ignores garbage, wrong types and over-long ids", () => {
    for (const raw of ["{", "not json", "null", '"a"', "{}", "42"]) {
      expect(loadMuted(memoryStorage({ "puggie-qc-muted": raw }))).toEqual([]);
    }
    expect(
      loadMuted(
        memoryStorage({
          "puggie-qc-muted": JSON.stringify(["a", 1, null, {}, "x".repeat(65)]),
        }),
      ),
    ).toEqual(["a"]);
    expect(loadMuted(memoryStorage())).toEqual([]);
    expect(loadMuted(undefined)).toEqual([]);
  });

  it("survives storage that throws", () => {
    expect(loadMuted(throwing)).toEqual([]);
    expect(() => saveMuted(throwing, ["a"])).not.toThrow();
    expect(() => saveMuted(undefined, ["a"])).not.toThrow();
  });

  it("toggleMuted adds, removes and drops the oldest past the cap", () => {
    expect(toggleMuted([], "a")).toEqual(["a"]);
    expect(toggleMuted(["a", "b"], "a")).toEqual(["b"]);
    const full = Array.from({ length: 32 }, (_, i) => `p${i}`);
    const next = toggleMuted(full, "new");
    expect(next).toHaveLength(32);
    expect(next[0]).toBe("p1");
    expect(next.at(-1)).toBe("new");
  });
});

describe("hidden storage", () => {
  it("stores 1 under puggie-qc-hidden and removes it when off", () => {
    expect(QUICK_CHAT_HIDDEN_KEY).toBe("puggie-qc-hidden");
    const s = memoryStorage();
    expect(loadHidden(s)).toBe(false);
    saveHidden(s, true);
    expect(s.data.get("puggie-qc-hidden")).toBe("1");
    expect(loadHidden(s)).toBe(true);
    saveHidden(s, false);
    expect(s.data.has("puggie-qc-hidden")).toBe(false);
    expect(loadHidden(s)).toBe(false);
  });

  it("only 1 counts as hidden", () => {
    expect(loadHidden(memoryStorage({ "puggie-qc-hidden": "true" }))).toBe(
      false,
    );
  });

  it("survives storage that throws", () => {
    expect(loadHidden(throwing)).toBe(false);
    expect(loadHidden(undefined)).toBe(false);
    expect(() => saveHidden(throwing, true)).not.toThrow();
    expect(() => saveHidden(throwing, false)).not.toThrow();
  });
});

describe("quickChatWaitMs", () => {
  const none = new Map<string, number>();

  it("is 0 with nothing sent or after every window passed", () => {
    expect(quickChatWaitMs([], none, "gg", 1000)).toBe(0);
    expect(quickChatWaitMs([], none, undefined, 1000)).toBe(0);
    expect(quickChatWaitMs([0], new Map([["gg", 0]]), "gg", 50_000)).toBe(0);
  });

  it("enforces the 1200ms gap", () => {
    expect(quickChatWaitMs([10_000], none, "gg", 10_000)).toBe(1200);
    expect(quickChatWaitMs([10_000], none, "gg", 10_500)).toBe(700);
    expect(quickChatWaitMs([10_000], none, "gg", 11_200)).toBe(0);
  });

  it("allows 5 per 10s burst", () => {
    const sends = [0, 1300, 2600, 3900, 5200];
    // gap is clear at 6400; the oldest of the five frees up at 10000
    expect(quickChatWaitMs(sends, none, undefined, 6400)).toBe(3600);
    expect(quickChatWaitMs(sends, none, undefined, 10_000)).toBe(0);
    expect(quickChatWaitMs(sends.slice(1), none, undefined, 6400)).toBe(0);
  });

  it("blocks the same id for 4s, other ids only by the gap", () => {
    const last = new Map([["gg", 0]]);
    expect(quickChatWaitMs([0], last, "gg", 1200)).toBe(2800);
    expect(quickChatWaitMs([0], last, "thanks", 1200)).toBe(0);
    expect(quickChatWaitMs([0], last, undefined, 1200)).toBe(0);
    expect(quickChatWaitMs([0], last, "gg", 4000)).toBe(0);
  });
});

describe("quickChatAnnouncement", () => {
  it("is built only from the name and our own table text", () => {
    for (const id of QUICK_CHAT_IDS) {
      const item = QUICK_CHAT_ITEMS[id];
      const text = quickChatAnnouncement("Pug", id);
      expect(text).toBe(
        item.kind === "emote"
          ? `Pug sent an emote: ${item.text}`
          : `Pug says: ${item.text}`,
      );
    }
  });

  it("never echoes the id", () => {
    expect(quickChatAnnouncement("Pug", "e-thumbs-up")).not.toContain("e-");
    expect(quickChatAnnouncement("Pug", "bye-for-now")).not.toContain(
      "bye-for-now",
    );
  });
});
