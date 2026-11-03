import { cleanup, fireEvent, render, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomState } from "../../../src/ts/multiplayer/protocol";

vi.mock("../../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: () => false,
}));
const Race = vi.hoisted(() => ({
  backToLobby: vi.fn(),
  kickPlayer: vi.fn(),
  leaveRoom: vi.fn(),
  rematch: vi.fn(),
  reportPlayer: vi.fn(),
  rerollName: vi.fn(),
  setReady: vi.fn(),
  setRoomOpen: vi.fn(),
  startRace: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock("../../../src/ts/multiplayer/race", () => Race);
vi.mock(
  "../../../src/ts/components/pages/test/character-frames",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadCharacterSvg: vi.fn(async () => ""),
    prefetchCharacters: vi.fn(),
  }),
);

const Store = await import("../../../src/ts/multiplayer/store");
const { Lobby } = await import("../../../src/ts/multiplayer/components/Lobby");

const player = (
  id: string,
  patch: Partial<RoomState["players"][number]> = {},
): RoomState["players"][number] => ({
  id,
  name: `${id}Pug`,
  isBot: false,
  color: "opp1",
  ready: false,
  inLobby: false,
  connected: true,
  character: "puggie",
  progress: { wordIndex: 0, charIndex: 0, testMs: 0, wpm: 0 },
  finished: false,
  ...patch,
});

const room = (
  players: RoomState["players"],
  extra: Partial<RoomState> = {},
): RoomState => ({
  code: "ABCD2345",
  hostId: "host",
  phase: "lobby",
  settings: {
    mode: "time",
    mode2: 30,
    punctuation: false,
    numbers: false,
    language: "english",
  },
  settingsVersion: 1,
  open: false,
  quickMatch: false,
  players,
  ...extra,
});

const show = (r: RoomState, me: string): ReturnType<typeof render> => {
  Store.setMyId(me);
  Store.setRoom(r);
  return render(() => <Lobby room={r} />);
};

const badge = (container: HTMLElement, id: string): HTMLElement => {
  const row = container.querySelector<HTMLElement>(
    `[data-testid='mp-player'][data-player-id='${id}']`,
  );
  if (row === null) throw new Error(`no row for ${id}`);
  return within(row).getByTestId("mp-ready-badge");
};

describe("Lobby ready flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Store.setServerFeatures({
      characterSelect: false,
      openRooms: false,
      quickMatch: false,
      report: false,
      resultsReady: true,
    });
  });
  afterEach(() => cleanup());

  it("guest: big Ready under the list toggles to a green Ready ✓", () => {
    const players = [player("host"), player("me")];
    const { getByTestId, queryByTestId } = show(room(players), "me");
    const ready = getByTestId("mp-ready");
    expect(ready).toHaveTextContent("Ready");
    expect(ready).not.toHaveTextContent("✓");
    // under the player list, not in the footer
    expect(
      getByTestId("mp-player-list").compareDocumentPosition(ready) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(ready);
    expect(Race.setReady).toHaveBeenCalledWith(true);
    expect(queryByTestId("mp-start")).toBeNull();
    cleanup();

    const on = show(
      room([player("host"), player("me", { ready: true })]),
      "me",
    );
    const btn = on.getByTestId("mp-ready");
    expect(btn).toHaveTextContent("Ready ✓");
    expect(btn.className).toContain("--opp2");
    fireEvent.click(btn);
    expect(Race.setReady).toHaveBeenLastCalledWith(false);
  });

  it("ready / waiting badges per player; the host has none", () => {
    const players = [player("host"), player("a", { ready: true }), player("b")];
    const { container } = show(room(players), "a");
    expect(badge(container, "a")).toHaveAttribute("data-state", "ready");
    expect(badge(container, "a")).toHaveTextContent("ready");
    expect(badge(container, "b")).toHaveAttribute("data-state", "waiting");
    expect(badge(container, "b")).toHaveTextContent("waiting");
    const hostRow = container.querySelector(
      "[data-testid='mp-player'][data-player-id='host']",
    ) as HTMLElement;
    expect(within(hostRow).queryByTestId("mp-ready-badge")).toBeNull();
  });

  it("host: N/M ready next to Start, Start once everyone is ready", () => {
    const some = show(
      room([player("host"), player("a", { ready: true }), player("b")]),
      "host",
    );
    expect(some.getByTestId("mp-ready-count")).toHaveTextContent("1/2 ready");
    expect(some.getByTestId("mp-start")).toBeDisabled();
    expect(some.queryByTestId("mp-ready")).toBeNull();
    // same row as the Start button
    expect(some.getByTestId("mp-ready-count").parentElement).toBe(
      some.getByTestId("mp-start").parentElement,
    );
    cleanup();

    const all = show(
      room([
        player("host"),
        player("a", { ready: true }),
        player("b", { ready: true }),
      ]),
      "host",
    );
    expect(all.getByTestId("mp-ready-count")).toHaveTextContent("2/2 ready");
    expect(all.getByTestId("mp-start")).toBeEnabled();
  });

  it("sitting out a race: notice, Ready disabled until results", () => {
    const players = [
      player("host"),
      player("a"),
      player("me", { inLobby: true }),
    ];
    const racing = show(room(players, { phase: "racing" }), "me");
    expect(racing.getByTestId("mp-sitting-out")).toHaveTextContent(
      "a race is running without you",
    );
    expect(racing.getByTestId("mp-ready")).toBeDisabled();
    expect(racing.getByTestId("mp-reroll")).toBeDisabled();
    expect(badge(racing.container, "a")).toHaveAttribute(
      "data-state",
      "racing",
    );
    expect(badge(racing.container, "me")).toHaveAttribute(
      "data-state",
      "lobby",
    );
    cleanup();

    const results = show(room(players, { phase: "results" }), "me");
    expect(results.getByTestId("mp-sitting-out")).toHaveTextContent(
      "ready up to join the next race",
    );
    const ready = results.getByTestId("mp-ready");
    expect(ready).toBeEnabled();
    fireEvent.click(ready);
    expect(Race.setReady).toHaveBeenCalledWith(true);
  });
});
