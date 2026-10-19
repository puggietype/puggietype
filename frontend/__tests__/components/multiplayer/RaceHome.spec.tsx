import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRoom: vi.fn(),
  connect: vi.fn(),
}));
const store = vi.hoisted(() => ({ openRoomsOn: false }));

vi.mock("../../../src/ts/multiplayer/race", () => ({
  connect: mocks.connect,
  createRoom: mocks.createRoom,
  joinQueue: vi.fn(),
  joinRoom: vi.fn(),
  watchOpenRooms: vi.fn(),
  unwatchOpenRooms: vi.fn(),
}));
vi.mock("../../../src/ts/multiplayer/store", () => ({
  connectionStatus: () => "open",
  openRooms: () => ({ rooms: [], racing: 0 }),
  openRoomsOn: () => store.openRoomsOn,
  quickMatchOn: () => false,
}));
vi.mock("../../../src/ts/states/notifications", () => ({
  showNoticeNotification: vi.fn(),
}));

import { RaceHome } from "../../../src/ts/multiplayer/components/RaceHome";

const PRIVATE_HINT = "Private: only people with the code can join";
const OPEN_HINT = "Open: anyone can see this room's code and join";

describe("RaceHome create room", () => {
  beforeEach(() => {
    store.openRoomsOn = true;
    mocks.createRoom.mockClear();
  });
  afterEach(() => cleanup());

  it("labels the button Create room and keeps the mp-create testid", () => {
    const { getByTestId, getByText } = render(() => <RaceHome />);
    expect(getByTestId("mp-create")).toHaveTextContent("Create room");
    expect(getByText("create a room")).toBeInTheDocument();
  });

  it("is a labelled radio group with Private preselected", () => {
    const { getByRole, getByLabelText } = render(() => <RaceHome />);
    const group = getByRole("group", { name: "who can join" });
    expect(group.tagName).toBe("FIELDSET");
    const priv = getByLabelText<HTMLInputElement>("Private");
    const open = getByLabelText<HTMLInputElement>("Open");
    expect(priv.type).toBe("radio");
    expect(open.type).toBe("radio");
    expect(priv.name).toBe(open.name);
    expect(priv).toBeChecked();
    expect(open).not.toBeChecked();
  });

  it("shows each hint as visible text linked by aria-describedby", () => {
    const { getByLabelText, getByTestId } = render(() => <RaceHome />);
    expect(getByTestId("mp-create-hint-private")).toHaveTextContent(
      /^only people with the code can join$/,
    );
    expect(getByTestId("mp-create-hint-open")).toHaveTextContent(
      /^anyone can see this room's code and join$/,
    );
    expect(getByLabelText("Private")).toHaveAccessibleDescription(PRIVATE_HINT);
    expect(getByLabelText("Open")).toHaveAccessibleDescription(OPEN_HINT);
  });

  it("creates a private room by default, open once Open is chosen", () => {
    const { getByLabelText, getByTestId } = render(() => <RaceHome />);
    fireEvent.click(getByTestId("mp-create"));
    expect(mocks.createRoom).toHaveBeenLastCalledWith(undefined, {
      open: false,
    });
    fireEvent.click(getByLabelText("Open"));
    expect(getByLabelText("Open")).toBeChecked();
    expect(getByLabelText("Private")).not.toBeChecked();
    fireEvent.click(getByTestId("mp-create"));
    expect(mocks.createRoom).toHaveBeenLastCalledWith(undefined, {
      open: true,
    });
  });

  it("never remembers Open: a fresh render starts Private again", () => {
    const first = render(() => <RaceHome />);
    fireEvent.click(first.getByLabelText("Open"));
    expect(first.getByLabelText("Open")).toBeChecked();
    first.unmount();
    const { getByLabelText } = render(() => <RaceHome />);
    expect(getByLabelText("Private")).toBeChecked();
    expect(getByLabelText("Open")).not.toBeChecked();
  });

  it("re-renders of the hub (remount via Show) start Private too", () => {
    const [shown, setShown] = createSignal(true);
    const { getByLabelText, queryByLabelText } = render(() => (
      <>{shown() && <RaceHome />}</>
    ));
    fireEvent.click(getByLabelText("Open"));
    setShown(false);
    expect(queryByLabelText("Open")).toBeNull();
    setShown(true);
    expect(getByLabelText("Private")).toBeChecked();
  });

  it("open rooms off: no choice, creates private as before", () => {
    store.openRoomsOn = false;
    const { queryByRole, queryByText, getByTestId } = render(() => (
      <RaceHome />
    ));
    expect(queryByRole("radio")).toBeNull();
    expect(queryByText(OPEN_HINT)).toBeNull();
    fireEvent.click(getByTestId("mp-create"));
    expect(mocks.createRoom).toHaveBeenLastCalledWith(undefined, {
      open: false,
    });
  });
});
