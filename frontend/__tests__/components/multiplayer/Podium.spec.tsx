import { cleanup, fireEvent, render, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  RaceResult,
  RoomState,
} from "../../../src/ts/multiplayer/protocol";

const clientFlags = vi.hoisted(() => new Set<string>());
vi.mock("../../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: (flag: string) => clientFlags.has(flag),
}));
const Race = vi.hoisted(() => ({
  backToLobby: vi.fn(),
  kickPlayer: vi.fn(),
  leaveRoom: vi.fn(),
  rematch: vi.fn(),
  reportPlayer: vi.fn(),
  setReady: vi.fn(),
  startRace: vi.fn(),
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
const { Podium } =
  await import("../../../src/ts/multiplayer/components/Podium");

const BOT = "Pug Bot · ~120 wpm";
const HUMAN = "AVeryLongHumanPugName";

const player = (
  id: string,
  name: string,
  isBot: boolean,
  color: RoomState["players"][number]["color"],
): RoomState["players"][number] => ({
  id,
  name,
  isBot,
  color,
  ready: false,
  inLobby: false,
  connected: true,
  character: "puggie",
  progress: { wordIndex: 0, charIndex: 0, testMs: 0, wpm: 0 },
  finished: true,
});

const ROOM: RoomState = {
  code: "ABCD2345",
  hostId: "me",
  phase: "results",
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
  players: [
    player("me", "ZippyPug42", false, "opp1"),
    player("bot", BOT, true, "opp2"),
    player("them", HUMAN, false, "opp3"),
  ],
};

const result = (
  playerId: string,
  name: string,
  isBot: boolean,
  place: number,
): RaceResult => ({
  playerId,
  name,
  isBot,
  place,
  wpm: 100,
  raw: 100,
  acc: 98,
  testMs: 30000,
  finished: true,
  flagged: false,
  reasons: [],
});

const RESULTS: RaceResult[] = [
  result("bot", BOT, true, 1),
  result("them", HUMAN, false, 2),
  result("me", "ZippyPug42", false, 3),
];

const nameIn = (container: HTMLElement, id: string): HTMLElement => {
  const row = container.querySelector<HTMLElement>(
    `[data-testid='mp-result-row'][data-player-id='${id}']`,
  );
  if (row === null) throw new Error(`no row for ${id}`);
  return within(row).getByTestId("mp-result-name");
};

describe("Podium results name cell", () => {
  beforeEach(() => {
    clientFlags.clear();
    clientFlags.add("report");
    Store.setServerFeatures({
      characterSelect: false,
      openRooms: false,
      quickMatch: true,
      report: true,
    });
    Store.setMyId("me");
    Store.setRoom(ROOM);
    Store.setReports(new Map());
  });
  afterEach(() => cleanup());

  it("bot name is not truncated, labelled, halves nowrap", () => {
    const { container } = render(() => (
      <Podium room={ROOM} results={RESULTS} />
    ));
    const name = nameIn(container, "bot");
    expect(name).not.toHaveClass("truncate");
    expect(name).toHaveClass("min-w-min");
    expect(name).toHaveAttribute("title", BOT);
    expect(name).toHaveAttribute("aria-label", `🤖 Bot ${BOT}`);
    const halves = [...name.querySelectorAll(".whitespace-nowrap")].map(
      (el) => el.textContent,
    );
    expect(halves).toEqual(["Pug Bot ·", "~120 wpm"]);
  });

  it("human name truncates with a full-name title", () => {
    const { container } = render(() => (
      <Podium room={ROOM} results={RESULTS} />
    ));
    const name = nameIn(container, "them");
    expect(name).toHaveClass("truncate");
    expect(name).toHaveAttribute("title", HUMAN);
    expect(name).not.toHaveAttribute("aria-label");
  });

  it("keeps the human name beside the report thanks", () => {
    Store.setReports(new Map([["them", "received"]]));
    const { container } = render(() => (
      <Podium room={ROOM} results={RESULTS} />
    ));
    const name = nameIn(container, "them");
    expect(name).toHaveTextContent(HUMAN);
    const row = name.closest<HTMLElement>("[data-testid='mp-result-row']");
    const thanks = within(row as HTMLElement).getByTestId("mp-report-thanks");
    expect(thanks).toHaveTextContent("thanks, report received");
    expect(thanks).not.toHaveClass("shrink-0");
    expect(thanks).toHaveClass("min-w-0");
  });

  it("goes side by side from a 1280px viewport, not from xl (1361px)", () => {
    const { getByTestId } = render(() => (
      <Podium room={ROOM} results={RESULTS} />
    ));
    const podium = getByTestId("mp-podium");
    expect(podium).toHaveClass(
      "grid",
      "max-w-3xl",
      "min-[1280px]:max-w-none",
      "min-[1280px]:grid-cols-[2fr_3fr]",
    );
    expect(podium.className).not.toMatch(/(^|\s)(xl|lg|md):grid-cols/);
  });

  it("caps a long winner heading with the full text in title (QM-008)", () => {
    const LONG = "ExtraordinarilyMagnificentSnuffleWaggleTheThirdOfPugshire99";
    const results = [result("them", LONG, false, 1), ...RESULTS.slice(0, 1)];
    const { getByTestId } = render(() => (
      <Podium room={ROOM} results={results} />
    ));
    const heading = getByTestId("mp-winner");
    // only the name is clamped; the heading itself never clips the label
    expect(heading).not.toHaveClass("line-clamp-3");
    expect(getByTestId("mp-winner-name")).toHaveClass(
      "line-clamp-3",
      "min-[1280px]:line-clamp-2",
    );
    expect(getByTestId("mp-winner-label")).toHaveTextContent("winner");
    expect(getByTestId("mp-winner-label")).not.toHaveClass(/line-clamp/);
    expect(heading).toHaveAttribute("title", `${LONG} wins!`);
    expect(heading).toHaveAttribute("aria-label", `${LONG} wins!`);
  });
});

describe("Podium next race (results-screen ready)", () => {
  const FEATURES = {
    characterSelect: false,
    openRooms: false,
    quickMatch: true,
    report: false,
    resultsReady: true,
  };
  const withPlayers = (
    patch: Record<string, Partial<RoomState["players"][number]>>,
    extra: Partial<RoomState> = {},
  ): RoomState => ({
    ...ROOM,
    ...extra,
    players: ROOM.players.map((p) => ({ ...p, ...patch[p.id] })),
  });
  const show = (room: RoomState, me: string): ReturnType<typeof render> => {
    Store.setMyId(me);
    Store.setRoom(room);
    return render(() => <Podium room={room} results={RESULTS} />);
  };

  beforeEach(() => {
    clientFlags.clear();
    vi.clearAllMocks();
    Store.setServerFeatures(FEATURES);
    Store.setReports(new Map());
  });
  afterEach(() => cleanup());

  it("guest: ready for next race toggles to a green Ready ✓; back to lobby", () => {
    const { getByTestId, queryByTestId } = show(ROOM, "them");
    const ready = getByTestId("mp-ready");
    expect(ready).toHaveTextContent("Ready for next race");
    fireEvent.click(ready);
    expect(Race.setReady).toHaveBeenCalledWith(true);
    fireEvent.click(getByTestId("mp-back-to-lobby"));
    expect(Race.backToLobby).toHaveBeenCalled();
    expect(Race.rematch).not.toHaveBeenCalled();
    expect(queryByTestId("mp-start-next")).toBeNull();
    expect(queryByTestId("mp-rematch")).toBeNull();
    cleanup();

    const readied = show(withPlayers({ them: { ready: true } }), "them");
    const on = readied.getByTestId("mp-ready");
    expect(on).toHaveTextContent("Ready ✓");
    expect(on.className).toContain("--opp2");
    fireEvent.click(on);
    expect(Race.setReady).toHaveBeenLastCalledWith(false);
  });

  it("host: start next race waits on everyone still on results, with N/M ready", () => {
    const waiting = show(ROOM, "me");
    expect(waiting.getByTestId("mp-ready-count")).toHaveTextContent(
      "1/2 ready",
    );
    expect(waiting.getByTestId("mp-start-next")).toBeDisabled();
    expect(waiting.queryByTestId("mp-ready")).toBeNull();
    cleanup();

    const ready = show(withPlayers({ them: { ready: true } }), "me");
    expect(ready.getByTestId("mp-ready-count")).toHaveTextContent("2/2 ready");
    const start = ready.getByTestId("mp-start-next");
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(Race.startRace).toHaveBeenCalled();
    // the host's back to lobby takes the room there
    fireEvent.click(ready.getByTestId("mp-back-to-lobby"));
    expect(Race.rematch).toHaveBeenCalled();
  });

  it("host: a player back in the lobby doesn't block the start", () => {
    const { getByTestId, container } = show(
      withPlayers({ them: { inLobby: true } }),
      "me",
    );
    expect(getByTestId("mp-ready-count")).toHaveTextContent("1/1 ready");
    expect(getByTestId("mp-start-next")).toBeEnabled();
    const row = container.querySelector<HTMLElement>(
      "[data-testid='mp-result-row'][data-player-id='them']",
    );
    expect(
      within(row as HTMLElement).getByTestId("mp-ready-badge"),
    ).toHaveAttribute("data-state", "lobby");
  });

  it("Quick Match rooms keep the host rematch", () => {
    const { getByTestId, queryByTestId } = show(
      { ...ROOM, quickMatch: true },
      "me",
    );
    expect(getByTestId("mp-rematch")).toBeInTheDocument();
    expect(queryByTestId("mp-start-next")).toBeNull();
    expect(queryByTestId("mp-ready-badge")).toBeNull();
  });

  it("older servers keep the host rematch", () => {
    Store.setServerFeatures({ ...FEATURES, resultsReady: undefined });
    const { getByTestId, queryByTestId } = show(ROOM, "me");
    expect(getByTestId("mp-rematch")).toBeInTheDocument();
    expect(queryByTestId("mp-next-race")).toBeNull();
  });
});
