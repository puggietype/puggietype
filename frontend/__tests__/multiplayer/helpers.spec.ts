import { describe, expect, it } from "vitest";

import {
  buildFinishInput,
  canStartRace,
  inviteLink,
  normalizeRoomCode,
  parseInvitePath,
  progressChanged,
  raceConfigFromSettings,
  wsUrl,
} from "../../src/ts/multiplayer/helpers";
import type { RoomState } from "../../src/ts/multiplayer/protocol";
import {
  DEFAULT_SETTINGS,
  parseClientMessage,
} from "../../src/ts/multiplayer/protocol";

describe("normalizeRoomCode", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeRoomCode(" abc-23x ")).toBe("ABC23X");
  });
  it("rejects wrong length and ambiguous chars", () => {
    expect(normalizeRoomCode("ABC12")).toBeUndefined();
    expect(normalizeRoomCode("ABCDE0")).toBeUndefined();
    expect(normalizeRoomCode("ABCDEFG")).toBeUndefined();
  });
});

describe("invite links", () => {
  it("builds and parses /r/CODE", () => {
    const link = inviteLink("https://puggie.example", "ABC234");
    expect(link).toBe("https://puggie.example/r/ABC234");
    expect(parseInvitePath(new URL(link).pathname)).toBe("ABC234");
  });
  it("accepts lowercase and a trailing slash", () => {
    expect(parseInvitePath("/r/abc234/")).toBe("ABC234");
  });
  it("ignores other paths", () => {
    expect(parseInvitePath("/race")).toBeUndefined();
    expect(parseInvitePath("/r/")).toBeUndefined();
  });
});

describe("wsUrl", () => {
  it("uses ws on http and wss on https", () => {
    expect(wsUrl({ protocol: "http:", host: "localhost:3000" })).toBe(
      "ws://localhost:3000/ws",
    );
    expect(wsUrl({ protocol: "https:", host: "x.dev" })).toBe("wss://x.dev/ws");
  });
});

function room(players: Partial<RoomState["players"][number]>[]): RoomState {
  return {
    code: "ABC234",
    hostId: "h",
    phase: "lobby",
    settings: DEFAULT_SETTINGS,
    settingsVersion: 1,
    players: players.map((p, i) => ({
      id: `p${i}`,
      name: `p${i}`,
      color: "opp1",
      ready: false,
      connected: true,
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

describe("raceConfigFromSettings", () => {
  it("maps time settings", () => {
    expect(
      raceConfigFromSettings({
        mode: "time",
        mode2: 15,
        punctuation: true,
        numbers: false,
        language: "english_1k",
      }),
    ).toEqual({
      mode: "time",
      time: 15,
      punctuation: true,
      numbers: false,
      language: "english_1k",
    });
  });
  it("maps words settings", () => {
    expect(
      raceConfigFromSettings({ ...DEFAULT_SETTINGS, mode: "words", mode2: 10 }),
    ).toMatchObject({ mode: "words", words: 10 });
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

describe("buildFinishInput", () => {
  it("appends the current word when it has input", () => {
    expect(buildFinishInput(["the", "quick"], "fo")).toEqual([
      "the",
      "quick",
      "fo",
    ]);
  });
  it("skips an empty current word", () => {
    expect(buildFinishInput(["the"], "")).toEqual(["the"]);
  });
});

describe("protocol copy", () => {
  it("validates client messages like the server", () => {
    expect(parseClientMessage('{"type":"ping","t":1}').ok).toBe(true);
    expect(
      parseClientMessage('{"type":"hello","name":"  \\u200bpug  "}'),
    ).toEqual({ ok: true, msg: { type: "hello", name: "pug" } });
    expect(parseClientMessage('{"type":"nope"}').ok).toBe(false);
  });
});
