import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomState } from "../../../src/ts/multiplayer/protocol";

const clientFlags = vi.hoisted(() => new Set<string>());
vi.mock("../../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: (flag: string) => clientFlags.has(flag),
}));
const reportPlayer = vi.hoisted(() => vi.fn());
vi.mock("../../../src/ts/multiplayer/race", () => ({ reportPlayer }));

const Store = await import("../../../src/ts/multiplayer/store");
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
  open: true,
  quickMatch: false,
  players: [player("me"), player("them"), player("bot1", true)],
};

function features(report: boolean): void {
  Store.setServerFeatures({
    characterSelect: false,
    openRooms: true,
    quickMatch: false,
    report,
  });
}

function renderFor(id: string): ReturnType<typeof render> {
  const p = ROOM.players.find((x) => x.id === id) ?? player(id);
  return render(() => <ReportButton room={ROOM} player={p} />);
}

describe("ReportButton", () => {
  beforeEach(() => {
    clientFlags.clear();
    clientFlags.add("report");
    features(true);
    Store.setMyId("me");
    Store.setReports(new Map());
    reportPlayer.mockClear();
  });
  afterEach(() => cleanup());

  it("is hidden with the client flag off", () => {
    clientFlags.clear();
    const { queryByTestId } = renderFor("them");
    expect(queryByTestId("mp-report")).toBeNull();
  });

  it("is hidden with the server flag off", () => {
    features(false);
    const { queryByTestId } = renderFor("them");
    expect(queryByTestId("mp-report")).toBeNull();
  });

  it("is hidden for ourselves and for bots", () => {
    const { queryByTestId } = render(() => (
      <>
        <ReportButton room={ROOM} player={player("me")} />
        <ReportButton room={ROOM} player={player("bot1", true)} />
        <ReportButton room={ROOM} player={{ id: "bot1", name: "x" }} />
      </>
    ));
    expect(queryByTestId("mp-report")).toBeNull();
  });

  it("opens a menu of the four preset reasons with no text input", () => {
    const { getByTestId, getAllByTestId, queryByTestId, container } =
      renderFor("them");
    expect(queryByTestId("mp-report-menu")).toBeNull();
    const button = getByTestId("mp-report");
    expect(button).toHaveAttribute("aria-label", "report themPug");
    fireEvent.click(button);
    const menu = getByTestId("mp-report-menu");
    expect(menu).toHaveAttribute("role", "menu");
    expect(
      getAllByTestId("mp-report-reason").map((b) => b.dataset["reason"]),
    ).toEqual(["cheating", "afk", "name", "other"]);
    expect(
      container.querySelectorAll("input, textarea, [contenteditable]"),
    ).toHaveLength(0);
    expect(container.textContent?.toLowerCase()).not.toContain("anonymous");
  });

  it("sends the picked reason and closes", () => {
    const { getByTestId, getAllByTestId, queryByTestId } = renderFor("them");
    fireEvent.click(getByTestId("mp-report"));
    fireEvent.click(getAllByTestId("mp-report-reason")[1] as HTMLElement);
    expect(reportPlayer).toHaveBeenCalledWith("them", "afk");
    expect(queryByTestId("mp-report-menu")).toBeNull();
  });

  it("thanks once the server received it", () => {
    Store.setReports(new Map([["them", "sending"]]));
    const { getByTestId, queryByTestId } = renderFor("them");
    expect(queryByTestId("mp-report")).toBeNull();
    expect(getByTestId("mp-report-thanks")).toHaveTextContent(
      "sending report...",
    );
    Store.setReports(new Map([["them", "received"]]));
    expect(getByTestId("mp-report-thanks")).toHaveTextContent(
      "thanks, report received",
    );
  });

  it("closes on Escape", () => {
    const { getByTestId, queryByTestId } = renderFor("them");
    fireEvent.click(getByTestId("mp-report"));
    fireEvent.keyDown(getByTestId("mp-report-menu"), { key: "Escape" });
    expect(queryByTestId("mp-report-menu")).toBeNull();
  });
});
