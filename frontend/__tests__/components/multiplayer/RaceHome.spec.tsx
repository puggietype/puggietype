import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRoom: vi.fn(),
  connect: vi.fn(),
}));
const store = vi.hoisted(() => ({ openRoomsOn: false, quickMatchOn: false }));

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
  quickMatchOn: () => store.quickMatchOn,
}));
vi.mock("../../../src/ts/states/notifications", () => ({
  showNoticeNotification: vi.fn(),
}));

import { RaceHome } from "../../../src/ts/multiplayer/components/RaceHome";
import { PRIMARY_BUTTON } from "../../../src/ts/multiplayer/components/ui";

const PRIVATE_HINT = "Private: only people with the code can join";
const OPEN_HINT = "Open: anyone can see this room's code and join";

describe("RaceHome create room", () => {
  beforeEach(() => {
    store.openRoomsOn = true;
    store.quickMatchOn = false;
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

describe("RaceHome layout", () => {
  beforeEach(() => {
    store.openRoomsOn = true;
  });
  afterEach(() => cleanup());

  const sections = (container: HTMLElement): string[] =>
    // left column cards, keyed by their heading (first child)
    [...(container.firstElementChild?.firstElementChild?.children ?? [])].map(
      (el) => el.firstElementChild?.textContent?.trim() ?? "",
    );

  const isPrimary = (el: HTMLElement): boolean =>
    PRIMARY_BUTTON.split(" ").every((c) => el.classList.contains(c));

  it.each([true, false])(
    "quickMatchOn=%s: quick play, create, join, open rooms in order",
    (on) => {
      store.quickMatchOn = on;
      const { container } = render(() => <RaceHome />);
      expect(sections(container)).toEqual([
        "quick play",
        "create a room",
        "join by code",
        "open rooms",
      ]);
    },
  );

  it("quick match on: find match is the sole primary, create is not", () => {
    store.quickMatchOn = true;
    const { getByTestId } = render(() => <RaceHome />);
    expect(isPrimary(getByTestId("mp-public"))).toBe(true);
    expect(isPrimary(getByTestId("mp-create"))).toBe(false);
    expect(getByTestId("mp-create")).toHaveClass("px-5", "py-3");
  });

  it("quick match off: coming soon, create stays primary", () => {
    store.quickMatchOn = false;
    const { getByTestId } = render(() => <RaceHome />);
    expect(getByTestId("mp-public-soon")).toHaveTextContent("coming soon");
    expect(isPrimary(getByTestId("mp-public"))).toBe(false);
    expect(isPrimary(getByTestId("mp-create"))).toBe(true);
  });
});
