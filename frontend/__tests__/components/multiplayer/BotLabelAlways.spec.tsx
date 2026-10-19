import { cleanup, render, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomState } from "../../../src/ts/multiplayer/protocol";

vi.mock("../../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: () => false,
}));
vi.mock("../../../src/ts/multiplayer/race", () => ({
  kickPlayer: vi.fn(),
  leaveRoom: vi.fn(),
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

const Store = await import("../../../src/ts/multiplayer/store");
const { RaceProgressBars } =
  await import("../../../src/ts/multiplayer/components/RaceProgressBars");
const { OpponentDogs } =
  await import("../../../src/ts/multiplayer/components/OpponentDogs");
const { OpponentCarets } =
  await import("../../../src/ts/multiplayer/components/OpponentCarets");
const { Lobby } = await import("../../../src/ts/multiplayer/components/Lobby");

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

  it("OpponentDogs captions (non-dense)", () => {
    const { container } = render(() => <OpponentDogs />);
    expectLabels(
      forPlayer(container, "mp-opponent-dog", "bot"),
      forPlayer(container, "mp-opponent-dog", "fake"),
    );
  });

  it("OpponentCarets name tags", () => {
    Store.setShowOpponentCarets(true);
    render(() => <OpponentCarets />);
    // portalled to body
    const tag = (id: string): HTMLElement =>
      within(forPlayer(document.body, "mp-opponent-caret", id)).getByTestId(
        "mp-opponent-tag",
      );
    expectLabels(tag("bot"), tag("fake"));
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
