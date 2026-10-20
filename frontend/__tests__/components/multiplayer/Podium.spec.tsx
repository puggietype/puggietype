import { cleanup, render, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  RaceResult,
  RoomState,
} from "../../../src/ts/multiplayer/protocol";

const clientFlags = vi.hoisted(() => new Set<string>());
vi.mock("../../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: (flag: string) => clientFlags.has(flag),
}));
vi.mock("../../../src/ts/multiplayer/race", () => ({
  kickPlayer: vi.fn(),
  leaveRoom: vi.fn(),
  rematch: vi.fn(),
  reportPlayer: vi.fn(),
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
    expect(heading).toHaveClass("line-clamp-3", "min-[1280px]:line-clamp-2");
    expect(heading).toHaveAttribute("title", `${LONG} wins!`);
  });
});
