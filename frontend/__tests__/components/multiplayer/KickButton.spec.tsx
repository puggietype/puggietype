import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomState } from "../../../src/ts/multiplayer/protocol";

const clientFlags = vi.hoisted(() => new Set<string>());
vi.mock("../../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: (flag: string) => clientFlags.has(flag),
}));
const kickPlayer = vi.hoisted(() => vi.fn());
const reportPlayer = vi.hoisted(() => vi.fn());
vi.mock("../../../src/ts/multiplayer/race", () => ({
  kickPlayer,
  reportPlayer,
}));

const Store = await import("../../../src/ts/multiplayer/store");
const { KickButton } =
  await import("../../../src/ts/multiplayer/components/KickButton");
const { ReportButton } =
  await import("../../../src/ts/multiplayer/components/ReportButton");

const player = (id: string, isBot = false): RoomState["players"][number] => ({
  id,
  name: isBot ? "Pug Bot · ~80 wpm" : `${id}Pug`,
  isBot,
  color: "opp1",
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
  players: [player("me"), player("them"), player("bot1", true)],
};

describe("KickButton", () => {
  beforeEach(() => {
    clientFlags.clear();
    clientFlags.add("report");
    Store.setServerFeatures({
      characterSelect: false,
      openRooms: true,
      quickMatch: true,
      report: true,
    });
    Store.setMyId("me");
    Store.setRoom(ROOM);
    Store.setReports(new Map());
    kickPlayer.mockClear();
  });
  afterEach(() => cleanup());

  it("lets the host kick a human in two clicks", () => {
    const { getByTestId } = render(() => (
      <KickButton room={ROOM} playerId="them" name="themPug" />
    ));
    const button = getByTestId("mp-kick");
    fireEvent.click(button);
    expect(kickPlayer).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(kickPlayer).toHaveBeenCalledWith("them");
  });

  it("is hidden for bots", () => {
    const { queryByTestId } = render(() => (
      <KickButton room={ROOM} playerId="bot1" name="🤖 Bot Pug Bot · ~80 wpm" />
    ));
    expect(queryByTestId("mp-kick")).toBeNull();
  });

  it("hides both kick and report next to a bot", () => {
    const bot = player("bot1", true);
    const { queryByTestId } = render(() => (
      <>
        <ReportButton room={ROOM} player={bot} />
        <KickButton room={ROOM} playerId={bot.id} name={bot.name} />
      </>
    ));
    expect(queryByTestId("mp-report")).toBeNull();
    expect(queryByTestId("mp-kick")).toBeNull();
    // sanity: both show for a human
    cleanup();
    const human = render(() => (
      <>
        <ReportButton room={ROOM} player={player("them")} />
        <KickButton room={ROOM} playerId="them" name="themPug" />
      </>
    ));
    expect(human.queryByTestId("mp-report")).not.toBeNull();
    expect(human.queryByTestId("mp-kick")).not.toBeNull();
  });
});
