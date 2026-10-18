import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomsList } from "../../../src/ts/multiplayer/open-rooms";
import type { OpenRoomEntry } from "../../../src/ts/multiplayer/protocol";

import { OpenRoomsList } from "../../../src/ts/multiplayer/components/OpenRoomsList";

const entry = (over: Partial<OpenRoomEntry> = {}): OpenRoomEntry => ({
  code: "ABCD2345",
  settings: {
    mode: "time",
    mode2: 30,
    punctuation: false,
    numbers: false,
    language: "english",
  },
  humans: 3,
  bots: 0,
  maxPlayers: 8,
  phase: "lobby",
  createdAgo: "lt1m",
  ...over,
});

function renderList(
  list: RoomsList | undefined,
  onJoin = vi.fn(),
): ReturnType<typeof render> {
  return render(() => (
    <OpenRoomsList list={list} disabled={false} onJoin={onJoin} />
  ));
}

describe("OpenRoomsList", () => {
  afterEach(() => cleanup());

  it("shows the empty state", () => {
    const { getByTestId, queryAllByTestId } = renderList({
      rooms: [],
      racing: 0,
    });
    expect(getByTestId("mp-open-rooms-empty")).toHaveTextContent(
      "no open rooms yet — open your lobby to list it",
    );
    expect(queryAllByTestId("mp-open-room")).toHaveLength(0);
  });

  it("renders settings, human count, phase and age; no bot badge at 0", () => {
    const { getByTestId, queryByTestId } = renderList({
      rooms: [entry()],
      racing: 0,
    });
    const row = getByTestId("mp-open-room");
    expect(row).toHaveTextContent("english · 30s");
    expect(getByTestId("mp-open-room-humans")).toHaveTextContent("3/8");
    expect(getByTestId("mp-open-room-phase")).toHaveTextContent("lobby");
    expect(getByTestId("mp-open-room-age")).toHaveTextContent("just opened");
    expect(queryByTestId("mp-open-room-bots")).toBeNull();
  });

  it("shows bots apart from the human count", () => {
    const { getByTestId } = renderList({
      rooms: [entry({ humans: 2, bots: 3 })],
      racing: 0,
    });
    expect(getByTestId("mp-open-room-humans")).toHaveTextContent("2/8");
    expect(getByTestId("mp-open-room-bots")).toHaveTextContent("🤖 3");
  });

  it("never renders a nickname that sneaks into an entry", () => {
    const sneaky = {
      ...entry(),
      name: "ZippyPug42",
      hostName: "ZippyPug42",
    } as OpenRoomEntry;
    const { container } = renderList({ rooms: [sneaky], racing: 0 });
    expect(container.textContent).not.toContain("ZippyPug42");
  });

  it("joins by code from a labelled, keyboard-usable button", () => {
    const onJoin = vi.fn();
    const { getByRole } = renderList(
      { rooms: [entry({ code: "WXYZ2345" })], racing: 0 },
      onJoin,
    );
    const join = getByRole("button", {
      name: "join english · 30s lobby, 3 of 8 players",
    });
    expect(join.tagName).toBe("BUTTON");
    fireEvent.click(join);
    expect(onJoin).toHaveBeenCalledWith("WXYZ2345");
  });

  it("announces count changes politely", () => {
    const { getByTestId } = renderList({ rooms: [entry()], racing: 4 });
    const status = getByTestId("mp-open-rooms-status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("1 open room · 4 racing now");
  });

  it("shows loading before the first list", () => {
    const { getByTestId } = renderList(undefined);
    expect(getByTestId("mp-open-rooms-loading")).toBeTruthy();
  });
});
