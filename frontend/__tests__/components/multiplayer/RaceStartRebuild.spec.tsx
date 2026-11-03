import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomState } from "../../../src/ts/multiplayer/protocol";

vi.mock("../../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: () => true,
}));
const loadCharacterSvg = vi.fn(async () => "<svg></svg>");
vi.mock(
  "../../../src/ts/components/pages/test/character-frames",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadCharacterSvg,
    prefetchCharacters: vi.fn(),
  }),
);

const Store = await import("../../../src/ts/multiplayer/store");
const { createPlayerIds, createSeat } =
  await import("../../../src/ts/multiplayer/seats");
const { RaceProgressBars } =
  await import("../../../src/ts/multiplayer/components/RaceProgressBars");
const { OpponentDogs } =
  await import("../../../src/ts/multiplayer/components/OpponentDogs");

type Player = RoomState["players"][number];

const player = (
  id: string,
  color: Player["color"],
  extra: Partial<Player> = {},
): Player => ({
  id,
  name: `Pug ${id}`,
  isBot: false,
  color,
  ready: true,
  inLobby: false,
  connected: true,
  character: "puggie",
  progress: { wordIndex: 0, charIndex: 0, testMs: 0, wpm: 0 },
  finished: false,
  ...extra,
});

const COUNTDOWN: RoomState = {
  code: "ABCD2345",
  hostId: "me",
  phase: "countdown",
  settings: {
    mode: "time",
    mode2: 15,
    punctuation: false,
    numbers: false,
    language: "english",
  },
  settingsVersion: 1,
  open: false,
  quickMatch: false,
  players: [
    player("me", "opp1"),
    player("a", "opp2"),
    player("b", "opp3"),
    player("c", "opp4"),
  ],
};

/** what the server sends as the countdown ends: same seats, new objects */
const racingSnapshot = (
  patch: (p: Player) => Partial<Player> = () => ({}),
): RoomState => ({
  ...COUNTDOWN,
  phase: "racing",
  players: COUNTDOWN.players.map((p) => ({ ...p, ...patch(p) })),
});

const byId = (testId: string): Map<string, HTMLElement> =>
  new Map(
    [
      ...document.querySelectorAll<HTMLElement>(`[data-testid='${testId}']`),
    ].map((el) => [el.dataset["playerId"] ?? "", el]),
  );

describe("createPlayerIds / createSeat", () => {
  it("keeps the ids array while only the player objects change", () => {
    createRoot((dispose) => {
      Store.setRoom(COUNTDOWN);
      const players = (): Player[] => Store.room()?.players ?? [];
      const ids = createPlayerIds(players);
      const first = ids();
      expect(first).toEqual(["me", "a", "b", "c"]);
      Store.setRoom(racingSnapshot());
      expect(ids()).toBe(first);
      Store.setRoom({ ...COUNTDOWN, players: COUNTDOWN.players.slice(0, 3) });
      expect(ids()).toEqual(["me", "a", "b"]);
      dispose();
    });
  });

  it("a seat follows its player's latest object and keeps the last one once gone", () => {
    createRoot((dispose) => {
      Store.setRoom(COUNTDOWN);
      const seat = createSeat("a", () => Store.room()?.players ?? []);
      expect(seat()?.connected).toBe(true);
      Store.setRoom(
        racingSnapshot((p) => (p.id === "a" ? { connected: false } : {})),
      );
      expect(seat()?.connected).toBe(false);
      Store.setRoom({
        ...COUNTDOWN,
        players: [COUNTDOWN.players[0] as Player],
      });
      expect(seat()?.id).toBe("a");
      dispose();
    });
  });
});

describe("race start: room:state doesn't rebuild the race chrome", () => {
  beforeEach(() => {
    loadCharacterSvg.mockClear();
    Store.setMyId("me");
    Store.setShowOpponentCarets(true);
    Store.setRoom(COUNTDOWN);
    Store.setOpponentProgress([]);
    Store.setRace({
      startAt: 0,
      words: ["hello", "world"],
      settings: COUNTDOWN.settings,
    });
  });
  afterEach(() => cleanup());

  it("keeps each opponent dog (and its loaded svg frames) across the racing room:state", async () => {
    render(() => <OpponentDogs />);
    await waitFor(() =>
      expect(
        document.querySelectorAll("[data-testid='mp-opponent-dog'] svg"),
      ).not.toHaveLength(0),
    );
    const before = byId("mp-opponent-dog");
    expect([...before.keys()]).toEqual(["a", "b", "c"]);
    const loads = loadCharacterSvg.mock.calls.length;

    Store.setRoom(racingSnapshot());
    const after = byId("mp-opponent-dog");
    for (const [id, el] of before) expect(after.get(id)).toBe(el);
    expect(loadCharacterSvg.mock.calls.length).toBe(loads);
  });

  it("still updates a kept dog from the new snapshot", () => {
    render(() => <OpponentDogs />);
    const dog = byId("mp-opponent-dog").get("b");
    Store.setRoom(
      racingSnapshot((p) => (p.id === "b" ? { connected: false } : {})),
    );
    expect(byId("mp-opponent-dog").get("b")).toBe(dog);
    expect(dog).toHaveClass("opacity-40");
    expect(dog).toHaveTextContent("reconnecting");
  });

  it("adds and drops dogs when the line-up changes", () => {
    render(() => <OpponentDogs />);
    Store.setRoom({
      ...racingSnapshot(),
      players: [...COUNTDOWN.players.slice(0, 2), player("d", "opp5")],
    });
    expect([...byId("mp-opponent-dog").keys()]).toEqual(["a", "d"]);
  });

  it("hides the other paw frames without display:none, so a paw press doesn't re-lay out an svg", async () => {
    render(() => <OpponentDogs />);
    const dog = byId("mp-opponent-dog").get("a");
    await waitFor(() => expect(dog?.querySelectorAll("svg")).toHaveLength(4));
    const frames = [...(dog?.querySelectorAll("svg") ?? [])].map(
      (svg) => svg.parentElement as HTMLElement,
    );
    expect(frames.filter((f) => f.classList.contains("hidden"))).toEqual([]);
    const shown = frames.filter(
      (f) => !f.classList.contains("[content-visibility:hidden]"),
    );
    expect(shown).toHaveLength(1);
  });

  it("keeps each progress row across the racing room:state, and updates it", () => {
    render(() => <RaceProgressBars />);
    const before = byId("mp-progress-row");
    expect([...before.keys()]).toEqual(["me", "a", "b", "c"]);

    Store.setRoom(
      racingSnapshot((p) => (p.id === "c" ? { connected: false } : {})),
    );
    const after = byId("mp-progress-row");
    for (const [id, el] of before) expect(after.get(id)).toBe(el);
    const name = after.get("c")?.firstElementChild;
    expect(name).toHaveClass("opacity-50");
  });
});
