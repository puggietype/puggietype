import { cleanup, render, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomState } from "../../../src/ts/multiplayer/protocol";

vi.mock("../../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: () => false,
}));
vi.mock("../../../src/ts/multiplayer/race", () => ({
  kickPlayer: vi.fn(),
  leaveRoom: vi.fn(),
  rematch: vi.fn(),
  resumeSession: vi.fn(() => false),
  reportPlayer: vi.fn(),
  rerollName: vi.fn(),
  setReady: vi.fn(),
  setRoomOpen: vi.fn(),
  startRace: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock(
  "../../../src/ts/components/pages/test/character-frames",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadCharacterSvg: vi.fn(async () => ""),
    prefetchCharacters: vi.fn(),
  }),
);

// states/test loads keyboard layouts on import
vi.mock("../../../src/ts/utils/json-data", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLayout: vi.fn(async () => ({ keys: {} })),
}));

const Store = await import("../../../src/ts/multiplayer/store");
const { RaceProgressBars } =
  await import("../../../src/ts/multiplayer/components/RaceProgressBars");
const { OpponentDogs } =
  await import("../../../src/ts/multiplayer/components/OpponentDogs");
const { OpponentCarets } =
  await import("../../../src/ts/multiplayer/components/OpponentCarets");
const { Lobby } = await import("../../../src/ts/multiplayer/components/Lobby");
const { Podium } =
  await import("../../../src/ts/multiplayer/components/Podium");
const { RaceOverlay } =
  await import("../../../src/ts/multiplayer/components/RaceOverlay");
const { PLAYER_BG } = await import("../../../src/ts/multiplayer/components/ui");
const { setFocus } = await import("../../../src/ts/states/test");

// flagged bot whose name the badge pattern rejects; human whose name it accepts
const EVIL = "Evil · ~50 wpm";
const LOOKALIKE = "Pug Bot · ~80 wpm";

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
  connected: true,
  character: "puggie",
  progress: { wordIndex: 0, charIndex: 0, testMs: 0, wpm: 0 },
  finished: false,
});

const ROOM: RoomState = {
  code: "ABCD2345",
  hostId: "me",
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
  players: [
    player("me", "ZippyPug42", false, "opp1"),
    player("bot", EVIL, true, "opp2"),
    player("fake", LOOKALIKE, false, "opp3"),
  ],
};

const RACE_ROOM: RoomState = { ...ROOM, phase: "racing" };

/** the row/caption/tag for a player, found by data-player-id */
const forPlayer = (
  root: ParentNode,
  testId: string,
  id: string,
): HTMLElement => {
  const el = root.querySelector<HTMLElement>(
    `[data-testid='${testId}'][data-player-id='${id}']`,
  );
  if (el === null) throw new Error(`no ${testId} for ${id}`);
  return el;
};

/** asserts the bot gets the label and the lookalike human doesn't */
function expectLabels(bot: HTMLElement, human: HTMLElement): void {
  expect(within(bot).getByTestId("mp-bot-label")).toHaveTextContent("Bot");
  expect(bot).toHaveTextContent(EVIL);
  expect(within(human).queryByTestId("mp-bot-label")).toBeNull();
  expect(human).toHaveTextContent(LOOKALIKE);
}

describe("BotLabel on every isBot player", () => {
  beforeEach(() => {
    Store.setServerFeatures({
      characterSelect: false,
      openRooms: false,
      quickMatch: true,
      report: false,
    });
    Store.setMyId("me");
    Store.setRoom(RACE_ROOM);
    Store.setOpponentProgress([]);
    Store.setRace({
      startAt: 0,
      words: ["hello", "world"],
      settings: RACE_ROOM.settings,
    });
  });
  afterEach(() => cleanup());

  it("RaceProgressBars rows", () => {
    const { container } = render(() => <RaceProgressBars />);
    expectLabels(
      forPlayer(container, "mp-progress-row", "bot"),
      forPlayer(container, "mp-progress-row", "fake"),
    );
  });

  it("a well-formed bot's progress row names it in full via title and aria-label", () => {
    const FULL = "Pug Bot · ~53 wpm";
    Store.setRoom({
      ...RACE_ROOM,
      players: [
        player("me", "ZippyPug42", false, "opp1"),
        player("pug", FULL, true, "opp2"),
      ],
    });
    const { container } = render(() => <RaceProgressBars />);
    const row = forPlayer(container, "mp-progress-row", "pug");
    expect(within(row).getByTestId("mp-bot-label")).toBeInTheDocument();
    const name = within(row).getByTestId("mp-player-name");
    expect(name).toHaveAttribute("title", FULL);
    expect(name).toHaveAttribute("aria-label", FULL);
    // the name is announced once, not once per chunk
    expect(within(row).getAllByRole("img", { name: FULL })).toHaveLength(1);
  });

  it("OpponentDogs captions (non-dense)", () => {
    const { container } = render(() => <OpponentDogs />);
    expectLabels(
      forPlayer(container, "mp-opponent-dog", "bot"),
      forPlayer(container, "mp-opponent-dog", "fake"),
    );
  });

  it("OpponentCarets draw colour only: no name, no label", () => {
    Store.setShowOpponentCarets(true);
    render(() => <OpponentCarets />);
    for (const id of ["bot", "fake"]) {
      // portalled to body
      const caret = forPlayer(document.body, "mp-opponent-caret", id);
      expect(caret).toHaveTextContent("");
      expect(caret.textContent).toBe("");
      expect(within(caret).queryByTestId("mp-bot-label")).toBeNull();
      expect(within(caret).queryByTestId("mp-opponent-tag")).toBeNull();
    }
  });

  it("each caret's colour matches the swatch on its named progress row", () => {
    Store.setShowOpponentCarets(true);
    render(() => <OpponentCarets />);
    const { container } = render(() => <RaceProgressBars />);
    const carets = document.querySelectorAll<HTMLElement>(
      "[data-testid='mp-opponent-caret']",
    );
    // one caret per opponent, none for us
    expect([...carets].map((c) => c.dataset["playerId"])).toEqual([
      "bot",
      "fake",
    ]);
    for (const caret of carets) {
      const id = caret.dataset["playerId"] ?? "";
      const seat = RACE_ROOM.players.find((p) => p.id === id);
      const bar = within(caret).getByTestId("mp-opponent-caret-bar");
      const row = forPlayer(container, "mp-progress-row", id);
      const swatch = within(row).getByTestId("mp-progress-swatch");
      expect(caret.dataset["color"]).toBe(seat?.color);
      expect(swatch.dataset["color"]).toBe(caret.dataset["color"]);
      const bg = PLAYER_BG[seat?.color ?? "opp1"];
      expect(bar).toHaveClass(bg);
      expect(swatch).toHaveClass(bg);
      // the row the swatch sits on is named, and the bot's is labelled
      expect(row).toHaveTextContent(seat?.name ?? "");
    }
    expectLabels(
      forPlayer(container, "mp-progress-row", "bot"),
      forPlayer(container, "mp-progress-row", "fake"),
    );
  });

  it.each([
    ["focus mode off, carets on", false, true],
    ["focus mode on, carets on", true, true],
    ["focus mode off, carets off", false, false],
    ["focus mode on, carets off", true, false],
  ])("race progress rows keep names + bot label (%s)", (_, focus, carets) => {
    Store.setShowOpponentCarets(carets);
    setFocus(focus);
    try {
      const { container } = render(() => <RaceOverlay />);
      const bot = forPlayer(container, "mp-progress-row", "bot");
      expectLabels(bot, forPlayer(container, "mp-progress-row", "fake"));
      expect(forPlayer(container, "mp-progress-row", "me")).toHaveTextContent(
        "ZippyPug42",
      );
      // nothing between the label and the page hides it
      let el: HTMLElement | null = within(bot).getByTestId("mp-bot-label");
      while (el !== null && el !== container) {
        expect(el).not.toHaveClass("hidden", "invisible", "opacity-0");
        expect(el.style.display).not.toBe("none");
        el = el.parentElement;
      }
    } finally {
      setFocus(false);
      Store.setShowOpponentCarets(true);
    }
  });

  it("Podium (results): winner and result rows keep names + bot label", () => {
    const results = [
      ["bot", EVIL, true],
      ["fake", LOOKALIKE, false],
      ["me", "ZippyPug42", false],
    ].map(([playerId, name, isBot], i) => ({
      playerId: playerId as string,
      name: name as string,
      isBot: isBot as boolean,
      place: i + 1,
      wpm: 90 - i * 10,
      raw: 95 - i * 10,
      acc: 98,
      testMs: 30_000,
      finished: true,
      flagged: false,
      reasons: [],
    }));
    const room: RoomState = { ...ROOM, phase: "results" };
    Store.setRoom(room);
    const { container } = render(() => (
      <Podium room={room} results={results} />
    ));
    const winner = within(container).getByTestId("mp-winner-name");
    expect(within(winner).getByTestId("mp-bot-label")).toHaveTextContent("Bot");
    expect(winner).toHaveTextContent(EVIL);
    const names = within(container).getAllByTestId("mp-result-name");
    const bot = names.find((n) => n.textContent?.includes(EVIL));
    const human = names.find((n) => n.textContent?.includes(LOOKALIKE));
    if (bot === undefined || human === undefined) {
      throw new Error("missing result rows");
    }
    expectLabels(bot, human);
    expect(names.some((n) => n.textContent?.includes("ZippyPug42"))).toBe(true);
  });

  it("Lobby rows, with displayName as the aria-label", () => {
    Store.setRoom(ROOM);
    const { container } = render(() => <Lobby room={ROOM} />);
    const bot = forPlayer(container, "mp-player", "bot");
    const human = forPlayer(container, "mp-player", "fake");
    expectLabels(bot, human);
    const botName = bot.querySelector(`[title='${EVIL}']`);
    expect(botName).toHaveAttribute("aria-label", `🤖 Bot ${EVIL}`);
    expect(botName).toHaveClass("min-w-min");
    const humanName = human.querySelector(`[title='${LOOKALIKE}']`);
    expect(humanName).not.toHaveAttribute("aria-label");
    expect(humanName).toHaveClass("truncate");
  });
});
