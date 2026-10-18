import { describe, expect, it } from "vitest";

import {
  canStartRace,
  finishInput,
  inviteLink,
  normalizeRoomCode,
  parseInvitePath,
  progressChanged,
  progressWpm,
  RACE_CONFIG_KEYS,
  isBehind,
  raceConfigOverrides,
  resumeText,
  roomKindLabel,
  wsUrl,
  envFlag,
} from "../../src/ts/multiplayer/helpers";
import type { RoomState } from "../../src/ts/multiplayer/protocol";
import {
  DEFAULT_SETTINGS,
  parseClientMessage,
} from "../../src/ts/multiplayer/protocol";

describe("normalizeRoomCode", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeRoomCode(" abcd-23xy ")).toBe("ABCD23XY");
  });
  it("rejects wrong length and ambiguous chars", () => {
    expect(normalizeRoomCode("ABC234")).toBeUndefined();
    expect(normalizeRoomCode("ABCDEFG0")).toBeUndefined();
    expect(normalizeRoomCode("ABCDEFGHJ")).toBeUndefined();
  });
});

describe("invite links", () => {
  it("builds and parses /r/CODE", () => {
    const link = inviteLink("https://puggie.example", "ABCD2345");
    expect(link).toBe("https://puggie.example/r/ABCD2345");
    expect(parseInvitePath(new URL(link).pathname)).toBe("ABCD2345");
  });
  it("accepts lowercase and a trailing slash", () => {
    expect(parseInvitePath("/r/abcd2345/")).toBe("ABCD2345");
  });
  it("ignores other paths", () => {
    expect(parseInvitePath("/race")).toBeUndefined();
    expect(parseInvitePath("/r/")).toBeUndefined();
  });
});

describe("wsUrl", () => {
  const local = {
    protocol: "http:",
    host: "localhost:3000",
    hostname: "localhost",
  };
  it("uses same-origin /ws (ws on http, wss on https) when unset", () => {
    expect(wsUrl(local)).toBe("ws://localhost:3000/ws");
    expect(
      wsUrl({
        protocol: "https:",
        host: "x.ngrok.app",
        hostname: "x.ngrok.app",
      }),
    ).toBe("wss://x.ngrok.app/ws");
  });
  it("prefers the build-time VITE_WS_URL", () => {
    expect(wsUrl(local, "wss://ws.example.com/ws")).toBe(
      "wss://ws.example.com/ws",
    );
    expect(wsUrl(local, "")).toBe("ws://localhost:3000/ws");
  });
  it("defaults to the production server on puggietype.com", () => {
    for (const hostname of ["puggietype.com", "www.puggietype.com"]) {
      expect(wsUrl({ protocol: "https:", host: hostname, hostname })).toBe(
        "wss://ws.puggietype.com/ws",
      );
    }
  });
});

describe("envFlag", () => {
  it("falls back to the default when unset or empty", () => {
    expect(envFlag(undefined, true)).toBe(true);
    expect(envFlag("", false)).toBe(false);
  });
  it("reads common true/false spellings", () => {
    for (const v of ["false", "0", "off", "no", "FALSE"]) {
      expect(envFlag(v, true)).toBe(false);
    }
    for (const v of ["true", "1", "on", "yes"]) {
      expect(envFlag(v, false)).toBe(true);
    }
  });
});

function room(players: Partial<RoomState["players"][number]>[]): RoomState {
  return {
    code: "ABC234",
    hostId: "h",
    phase: "lobby",
    settings: DEFAULT_SETTINGS,
    settingsVersion: 1,
    open: false,
    quickMatch: false,
    players: players.map((p, i) => ({
      id: `p${i}`,
      name: `p${i}`,
      isBot: false,
      color: "opp1",
      ready: false,
      connected: true,
      character: "puggie",
      progress: { wordIndex: 0, charIndex: 0, testMs: 0, wpm: 0 },
      finished: false,
      ...p,
    })),
  };
}

describe("canStartRace", () => {
  it("needs the host, 2+ players and every non-host ready", () => {
    const r = room([{ id: "h" }, { id: "b", ready: true }]);
    expect(canStartRace(r, "h")).toBe(true);
    expect(canStartRace(r, "b")).toBe(false);
  });
  it("is false alone or with an unready guest", () => {
    expect(canStartRace(room([{ id: "h" }]), "h")).toBe(false);
    expect(canStartRace(room([{ id: "h" }, { id: "b" }]), "h")).toBe(false);
  });
  it("is false outside the lobby", () => {
    const r = { ...room([{ id: "h" }, { id: "b", ready: true }]) };
    r.phase = "results";
    expect(canStartRace(r, "h")).toBe(false);
  });
});

function overrides(
  settings: Parameters<typeof raceConfigOverrides>[0],
): NonNullable<ReturnType<typeof raceConfigOverrides>> {
  const entries = raceConfigOverrides(settings);
  if (entries === undefined) throw new Error("expected overrides");
  return entries;
}

describe("raceConfigOverrides", () => {
  it("is undefined for a language this client doesn't ship", () => {
    expect(
      raceConfigOverrides({ ...DEFAULT_SETTINGS, language: "klingon_9k" }),
    ).toBeUndefined();
  });
  it("applies the room settings for time mode", () => {
    const entries = new Map<string, unknown>(
      overrides({
        mode: "time",
        mode2: 15,
        punctuation: true,
        numbers: false,
        language: "english_1k",
      }),
    );
    expect(entries.get("mode")).toBe("time");
    expect(entries.get("time")).toBe(15);
    expect(entries.has("words")).toBe(false);
    expect(entries.get("punctuation")).toBe(true);
    expect(entries.get("numbers")).toBe(false);
    expect(entries.get("language")).toBe("english_1k");
  });
  it("applies words mode", () => {
    const entries = new Map<string, unknown>(
      overrides({ ...DEFAULT_SETTINGS, mode: "words", mode2: 10 }),
    );
    expect(entries.get("mode")).toBe("words");
    expect(entries.get("words")).toBe(10);
  });
  it("neutralises settings that change or fail a result", () => {
    const entries = new Map<string, unknown>(overrides(DEFAULT_SETTINGS));
    expect(entries.get("funbox")).toEqual([]);
    expect(entries.get("lazyMode")).toBe(false);
    expect(entries.get("difficulty")).toBe("normal");
    expect(entries.get("minWpm")).toBe("off");
    expect(entries.get("minAcc")).toBe("off");
    expect(entries.get("minBurst")).toBe("off");
    expect(entries.get("stopOnError")).toBe("off");
    // a resume replays capitals without a shift key (MP-002)
    expect(entries.get("oppositeShiftMode")).toBe("off");
  });
  it("clears funboxes before changing the mode", () => {
    const keys = overrides(DEFAULT_SETTINGS).map(([k]) => k);
    expect(keys.indexOf("funbox")).toBeLessThan(keys.indexOf("mode"));
  });
});

describe("RACE_CONFIG_KEYS", () => {
  it("covers every overridden key plus both lengths", () => {
    for (const [key] of overrides(DEFAULT_SETTINGS)) {
      expect(RACE_CONFIG_KEYS).toContain(key);
    }
    expect(RACE_CONFIG_KEYS).toContain("time");
    expect(RACE_CONFIG_KEYS).toContain("words");
  });
});

describe("progressChanged", () => {
  const p = { wordIndex: 1, charIndex: 2, testMs: 500, wpm: 60, errors: 0 };
  it("is true without a previous send", () => {
    expect(progressChanged(undefined, p)).toBe(true);
  });
  it("ignores testMs-only changes", () => {
    expect(progressChanged(p, { ...p, testMs: 900 })).toBe(false);
  });
  it("detects position, error and whole-wpm changes", () => {
    expect(progressChanged(p, { ...p, charIndex: 3 })).toBe(true);
    expect(progressChanged(p, { ...p, errors: 1 })).toBe(true);
    expect(progressChanged(p, { ...p, wpm: 61 })).toBe(true);
    expect(progressChanged(p, { ...p, wpm: 60.2 })).toBe(false);
  });
});

describe("finishInput", () => {
  it("drops the separator the engine keeps on committed words", () => {
    expect(finishInput(["the ", "quick ", "fo"])).toEqual([
      "the",
      "quick",
      "fo",
    ]);
  });
  it("drops a newline separator", () => {
    expect(finishInput(["line\n", "next"])).toEqual(["line", "next"]);
  });
  it("only drops one separator", () => {
    expect(finishInput(["a  ", ""])).toEqual(["a ", ""]);
  });
});

describe("protocol copy", () => {
  it("validates client messages like the server", () => {
    expect(parseClientMessage('{"type":"ping","t":1}').ok).toBe(true);
    // a legacy client-supplied name is stripped: the server assigns names
    expect(parseClientMessage('{"type":"hello","name":"pug"}')).toEqual({
      ok: true,
      msg: { type: "hello" },
    });
    expect(parseClientMessage('{"type":"player:reroll"}').ok).toBe(true);
    expect(parseClientMessage('{"type":"nope"}').ok).toBe(false);
  });
});

describe("progressWpm", () => {
  const words = ["hello", "world", "again"];
  it("counts completed words plus their spaces and the current chars", () => {
    // "hello " (6) + "wo" (2) = 8 chars in 6s -> 8/5/0.1 = 16 wpm
    expect(progressWpm(words, 1, 2, 6000)).toBe(16);
  });
  it("is 0 before any time has passed", () => {
    expect(progressWpm(words, 1, 2, 0)).toBe(0);
  });
  it("caps the current word at its length", () => {
    expect(progressWpm(words, 0, 99, 6000)).toBe(10);
  });
});

describe("resume after a reload (MP-002)", () => {
  const words = ["the", "quick", "fox"];
  it("builds the text typed up to a position", () => {
    expect(resumeText(words, 0, 0)).toBe("");
    expect(resumeText(words, 1, 2)).toBe("the qu");
    expect(resumeText(words, 2, 0)).toBe("the quick ");
  });
  it("clamps past the end of a word or the list", () => {
    expect(resumeText(words, 0, 99)).toBe("the");
    expect(resumeText(words, 9, 0)).toBe("the quick fox");
  });
  it("compares positions", () => {
    const floor = { wordIndex: 3, charIndex: 2 };
    expect(isBehind({ wordIndex: 2, charIndex: 9 }, floor)).toBe(true);
    expect(isBehind({ wordIndex: 3, charIndex: 1 }, floor)).toBe(true);
    expect(isBehind({ wordIndex: 3, charIndex: 2 }, floor)).toBe(false);
    expect(isBehind({ wordIndex: 4, charIndex: 0 }, floor)).toBe(false);
  });
});

describe("roomKindLabel", () => {
  it("names quick match, open and private rooms", () => {
    expect(roomKindLabel({ open: false, quickMatch: true })).toBe(
      "quick match",
    );
    expect(roomKindLabel({ open: true, quickMatch: true })).toBe("quick match");
    expect(roomKindLabel({ open: true, quickMatch: false })).toBe("open");
    expect(roomKindLabel({ open: false, quickMatch: false })).toBe("private");
  });
});
