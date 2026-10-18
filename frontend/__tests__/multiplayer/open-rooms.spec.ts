import { describe, expect, it } from "vitest";

import {
  botsText,
  humansText,
  openRoomsStatus,
  parseRoomsList,
  roomAgeAria,
  roomAgeText,
} from "../../src/ts/multiplayer/open-rooms";
import type { OpenRoomEntry } from "../../src/ts/multiplayer/protocol";

const entry: OpenRoomEntry = {
  code: "ABCD2345",
  settings: {
    mode: "words",
    mode2: 25,
    punctuation: false,
    numbers: false,
    language: "english",
  },
  humans: 3,
  bots: 0,
  maxPlayers: 8,
  phase: "lobby",
  createdAgo: "lt5m",
};

describe("open rooms list", () => {
  it("shows humans over capacity, bots separately and only when present", () => {
    expect(humansText(entry)).toBe("3/8");
    expect(botsText(entry)).toBeUndefined();
    expect(humansText({ ...entry, bots: 2 })).toBe("3/8");
    expect(botsText({ ...entry, bots: 2 })).toBe("🤖 2");
  });

  it("parses entries and drops nickname or id fields", () => {
    const list = parseRoomsList({
      rooms: [
        {
          ...entry,
          hostName: "ZippyPug42",
          hostId: "p1",
          names: ["ZippyPug42"],
          players: [{ id: "p1", name: "ZippyPug42" }],
        },
      ],
      racing: 5,
    });
    expect(list).toEqual({ rooms: [entry], racing: 5 });
    expect(Object.keys(list.rooms[0] ?? {}).sort()).toEqual([
      "bots",
      "code",
      "createdAgo",
      "humans",
      "maxPlayers",
      "phase",
      "settings",
    ]);
  });

  it("drops malformed entries but keeps the rest", () => {
    const list = parseRoomsList({
      rooms: [
        entry,
        { ...entry, code: "<script>" },
        { ...entry, humans: -1 },
        { ...entry, createdAgo: "1700000000000" },
        "nope",
      ],
      racing: "lots",
    });
    expect(list).toEqual({ rooms: [entry], racing: 0 });
    expect(parseRoomsList({})).toEqual({ rooms: [], racing: 0 });
  });

  it("defaults bots to 0 when an older server leaves them out", () => {
    const { bots: _bots, ...noBots } = entry;
    expect(parseRoomsList({ rooms: [noBots], racing: 0 }).rooms[0]?.bots).toBe(
      0,
    );
  });

  it("describes age buckets coarsely and the live status", () => {
    expect(roomAgeText("lt1m")).toBe("opened < 1 min ago");
    expect(roomAgeText("lt5m")).toBe("opened < 5 min ago");
    expect(roomAgeText("lt15m")).toBe("opened < 15 min ago");
    expect(roomAgeText("lt1h")).toBe("opened < 1 hour ago");
    expect(roomAgeText("gte1h")).toBe("opened 1+ hours ago");
    expect(roomAgeAria("lt5m")).toBe("room opened less than 5 minutes ago");
    expect(roomAgeAria("gte1h")).toBe("room opened 1 or more hours ago");
    expect(openRoomsStatus({ rooms: [entry], racing: 0 })).toBe("1 open room");
    expect(openRoomsStatus({ rooms: [entry, entry], racing: 3 })).toBe(
      "2 open rooms · 3 racing now",
    );
  });
});
