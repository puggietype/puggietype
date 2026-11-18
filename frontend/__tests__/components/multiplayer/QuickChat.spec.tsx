import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Phase, RoomState } from "../../../src/ts/multiplayer/protocol";
import type { QuickChatEntry } from "../../../src/ts/multiplayer/quick-chat";

const clientFlags = vi.hoisted(() => new Set<string>());
vi.mock("../../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: (flag: string) => clientFlags.has(flag),
}));
const race = vi.hoisted(() => ({
  sendQuickChat: vi.fn((_id: string) => true),
  setQuickChatHidden: vi.fn((_hidden: boolean) => undefined),
  toggleQuickChatMute: vi.fn((_id: string) => undefined),
}));
vi.mock("../../../src/ts/multiplayer/race", () => race);

const Store = await import("../../../src/ts/multiplayer/store");
const { QuickChat } =
  await import("../../../src/ts/multiplayer/components/QuickChat");
const { QuickChatBadge } =
  await import("../../../src/ts/multiplayer/components/QuickChatBadge");
const { QuickChatMuteButton } =
  await import("../../../src/ts/multiplayer/components/QuickChatMuteButton");
const { QUICK_CHAT_LINES, QUICK_CHAT_EMOTES } =
  await import("../../../src/ts/multiplayer/quick-chat-presets");

race.setQuickChatHidden.mockImplementation((hidden) => {
  Store.setQuickChatHiddenSignal(hidden);
});
race.toggleQuickChatMute.mockImplementation((id) => {
  const next = new Set(Store.mutedPlayers());
  if (next.has(id)) next.delete(id);
  else next.add(id);
  Store.setMutedPlayersSignal(next);
});

const player = (id: string, isBot = false): RoomState["players"][number] => ({
  id,
  name: isBot ? "Pug Bot · ~80 wpm" : `${id}Pug`,
  isBot,
  color: "opp1",
  ready: false,
  inLobby: false,
  connected: true,
  character: "puggie",
  progress: { wordIndex: 0, charIndex: 0, testMs: 0, wpm: 0 },
  finished: false,
});

const roomWith = (phase: Phase = "lobby"): RoomState => ({
  code: "ABCD2345",
  hostId: "me",
  phase,
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
});

let seq = 0;
const entry = (
  playerId: string,
  presetId: QuickChatEntry["presetId"],
): QuickChatEntry => ({ seq: ++seq, playerId, presetId, at: Date.now() });

function setup(phase: Phase = "lobby"): RoomState {
  const room = roomWith(phase);
  Store.setRoom(room);
  return room;
}

function renderPanel(
  variant: "lobby" | "results" = "lobby",
  phase: Phase = "lobby",
): ReturnType<typeof render> {
  const room = setup(phase);
  return render(() => <QuickChat room={room} variant={variant} />);
}

describe("QuickChat", () => {
  beforeEach(() => {
    clientFlags.clear();
    clientFlags.add("quickChat");
    Store.setServerFeatures({
      characterSelect: false,
      openRooms: false,
      quickMatch: false,
      report: false,
      quickChat: true,
    });
    Store.setMyId("me");
    Store.setQuickChatHiddenSignal(false);
    Store.setMutedPlayersSignal(new Set<string>());
    Store.setQuickChatFeed([]);
    Store.setQuickChatLatest(new Map());
    Store.setQuickChatCooldownUntil(0);
    Store.setQuickChatRepeatLocked(new Set<never>());
    Store.setQuickChatSlowHint(false);
    sessionStorage.clear();
    race.sendQuickChat.mockClear();
    race.setQuickChatHidden.mockClear();
    race.toggleQuickChatMute.mockClear();
  });
  afterEach(() => {
    cleanup();
    Store.setRoom(undefined);
    vi.useRealTimers();
  });

  it("renders nothing with the client flag off", () => {
    clientFlags.clear();
    const { container } = renderPanel();
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing with the server feature off", () => {
    Store.setServerFeatures({
      characterSelect: false,
      openRooms: false,
      quickMatch: false,
      report: false,
    });
    const { queryByTestId } = renderPanel();
    expect(queryByTestId("mp-quickchat")).toBeNull();
  });

  it("renders nothing in the kids flow", () => {
    sessionStorage.setItem("puggie-kids-flow", "1");
    const { queryByTestId } = renderPanel();
    expect(queryByTestId("mp-quickchat")).toBeNull();
  });

  it("renders 14 lines and 8 emotes in labelled groups, no text field", () => {
    const { container, getByTestId, getByRole } = renderPanel();
    for (const id of QUICK_CHAT_LINES) {
      expect(getByTestId(`mp-quickchat-line-${id}`)).toBeInTheDocument();
    }
    for (const id of QUICK_CHAT_EMOTES) {
      expect(getByTestId(`mp-quickchat-emote-${id}`)).toBeInTheDocument();
    }
    const lines = getByRole("group", { name: "Quick chat lines" });
    const emotes = getByRole("group", { name: "Quick chat emotes" });
    expect(lines.querySelectorAll("button")).toHaveLength(14);
    expect(emotes.querySelectorAll("button")).toHaveLength(8);
    expect(
      container.querySelectorAll(
        "input[type=text], input:not([type]), textarea, [contenteditable]",
      ),
    ).toHaveLength(0);
    const inputs = container.querySelectorAll("input");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveAttribute("role", "switch");
    expect(inputs[0]).toHaveAttribute("type", "checkbox");
    expect(inputs[0]).toHaveAttribute("data-testid", "mp-quickchat-hide");
  });

  it("labels emotes and lines for screen readers", () => {
    const { getByTestId } = renderPanel();
    expect(getByTestId("mp-quickchat-emote-e-handshake")).toHaveAttribute(
      "aria-label",
      "send emote: handshake",
    );
    expect(getByTestId("mp-quickchat-emote-e-wow")).toHaveAttribute(
      "aria-label",
      "send emote: wow",
    );
    expect(getByTestId("mp-quickchat-line-gg")).toHaveAttribute(
      "aria-label",
      "send: gg",
    );
  });

  it("click sends via sendQuickChat and shows the sent hint", () => {
    const { getByTestId } = renderPanel();
    fireEvent.click(getByTestId("mp-quickchat-line-gg"));
    expect(race.sendQuickChat).toHaveBeenCalledTimes(1);
    expect(race.sendQuickChat).toHaveBeenCalledWith("gg");
    expect(getByTestId("mp-quickchat-hint")).toHaveTextContent("sent: gg");
  });

  it("Enter on a focused button sends once", async () => {
    const user = userEvent.setup();
    const { getByTestId } = renderPanel();
    const button = getByTestId("mp-quickchat-emote-e-paw");
    button.focus();
    await user.keyboard("{Enter}");
    expect(race.sendQuickChat).toHaveBeenCalledTimes(1);
    expect(race.sendQuickChat).toHaveBeenCalledWith("e-paw");
  });

  it("marks buttons aria-disabled during the cooldown, still focusable", () => {
    const { getByTestId } = renderPanel();
    const button = getByTestId("mp-quickchat-line-thanks");
    expect(button).toHaveAttribute("aria-disabled", "false");
    Store.setQuickChatCooldownUntil(Date.now() + 1000);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    button.focus();
    expect(document.activeElement).toBe(button);
    Store.setQuickChatCooldownUntil(0);
    expect(button).toHaveAttribute("aria-disabled", "false");
  });

  it("marks only the repeat-locked id aria-disabled", () => {
    const { getByTestId } = renderPanel();
    Store.setQuickChatRepeatLocked(new Set(["gg"] as const));
    expect(getByTestId("mp-quickchat-line-gg")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(getByTestId("mp-quickchat-line-thanks")).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("shows the slow-down hint", () => {
    const { getByTestId } = renderPanel();
    Store.setQuickChatSlowHint(true);
    expect(getByTestId("mp-quickchat-hint")).toHaveTextContent(
      "slow down a moment",
    );
  });

  for (const phase of ["racing", "countdown"] as const) {
    it(`is paused while ${phase}`, () => {
      const { getByTestId } = renderPanel("lobby", phase);
      expect(getByTestId("mp-quickchat-hint")).toHaveTextContent(
        "quick-chat is paused while a race runs",
      );
      expect(getByTestId("mp-quickchat-line-gg")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
  }

  it("the hide switch hides the picker and feed", () => {
    Store.setQuickChatFeed([entry("them", "gg")]);
    const { getByTestId, queryByTestId } = renderPanel();
    const hide = getByTestId("mp-quickchat-hide");
    expect(hide).not.toBeChecked();
    fireEvent.click(hide);
    expect(race.setQuickChatHidden).toHaveBeenCalledWith(true);
    expect(queryByTestId("mp-quickchat-line-gg")).toBeNull();
    expect(queryByTestId("mp-quickchat-feed")).toBeNull();
    expect(getByTestId("mp-quickchat-hide")).toBeChecked();
    fireEvent.click(getByTestId("mp-quickchat-hide"));
    expect(race.setQuickChatHidden).toHaveBeenLastCalledWith(false);
    expect(getByTestId("mp-quickchat-line-gg")).toBeInTheDocument();
  });

  it("feed shows names and table text only", () => {
    Store.setQuickChatFeed([entry("them", "gg"), entry("me", "e-handshake")]);
    const { getAllByTestId } = renderPanel();
    const items = getAllByTestId("mp-quickchat-feed-item");
    expect(items.map((li) => li.textContent)).toEqual([
      "themPuggg",
      "mePughandshake",
    ]);
  });

  it("results variant starts collapsed and toggles", () => {
    Store.setQuickChatFeed([entry("them", "thanks")]);
    const { getByTestId, queryByTestId } = renderPanel("results", "results");
    const toggle = getByTestId("mp-quickchat-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute(
      "aria-controls",
      getByTestId("mp-quickchat-panel").id,
    );
    expect(getByTestId("mp-quickchat-panel")).toHaveClass("hidden");
    expect(getByTestId("mp-quickchat-latest")).toHaveTextContent(
      "themPugthanks!",
    );
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(getByTestId("mp-quickchat-panel")).not.toHaveClass("hidden");
    expect(queryByTestId("mp-quickchat-latest")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("lobby variant is always open with no toggle", () => {
    const { getByTestId, queryByTestId } = renderPanel("lobby");
    expect(queryByTestId("mp-quickchat-toggle")).toBeNull();
    expect(getByTestId("mp-quickchat-panel")).not.toHaveClass("hidden");
  });

  describe("announcements", () => {
    it("go through the single role=status region", () => {
      vi.useFakeTimers();
      const { container, getByTestId } = renderPanel();
      const live = getByTestId("mp-quickchat-live");
      expect(container.querySelectorAll("[role=status]")).toHaveLength(1);
      expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
      expect(live).toHaveAttribute("role", "status");
      expect(live).toHaveAttribute("aria-live", "polite");
      expect(live).toHaveTextContent("");
      Store.setQuickChatFeed([entry("them", "gg")]);
      vi.advanceTimersByTime(0);
      expect(live).toHaveTextContent("themPug says: gg");
      Store.setQuickChatFeed((f) => [...f, entry("them", "e-heart")]);
      vi.advanceTimersByTime(1500);
      expect(live).toHaveTextContent("themPug sent an emote: heart");
    });

    it("coalesce a burst into a count", () => {
      vi.useFakeTimers();
      const { getByTestId } = renderPanel();
      const live = getByTestId("mp-quickchat-live");
      Store.setQuickChatFeed([entry("them", "gg")]);
      Store.setQuickChatFeed((f) => [...f, entry("me", "thanks")]);
      Store.setQuickChatFeed((f) => [...f, entry("them", "e-paw")]);
      vi.advanceTimersByTime(0);
      expect(live).toHaveTextContent("3 new quick-chat messages");
      Store.setQuickChatFeed((f) => [...f, entry("them", "brb")]);
      Store.setQuickChatFeed((f) => [...f, entry("me", "ready")]);
      vi.advanceTimersByTime(1499);
      expect(live).toHaveTextContent("3 new quick-chat messages");
      vi.advanceTimersByTime(1);
      expect(live).toHaveTextContent("2 new quick-chat messages");
    });

    it("do not re-announce the feed present at mount", () => {
      vi.useFakeTimers();
      Store.setQuickChatFeed([entry("them", "gg")]);
      const { getByTestId } = renderPanel();
      vi.advanceTimersByTime(5000);
      expect(getByTestId("mp-quickchat-live")).toHaveTextContent("");
    });
  });
});

describe("QuickChatBadge", () => {
  beforeEach(() => {
    clientFlags.clear();
    clientFlags.add("quickChat");
    Store.setServerFeatures({
      characterSelect: false,
      openRooms: false,
      quickMatch: false,
      report: false,
      quickChat: true,
    });
    Store.setQuickChatHiddenSignal(false);
    setup();
    Store.setQuickChatLatest(new Map([["them", entry("them", "e-heart")]]));
  });
  afterEach(() => {
    cleanup();
    Store.setRoom(undefined);
    Store.setQuickChatLatest(new Map());
  });

  it("shows the player's latest, hidden from assistive tech", () => {
    const { getByTestId } = render(() => <QuickChatBadge playerId="them" />);
    const badge = getByTestId("mp-quickchat-badge");
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(badge).toHaveAttribute("data-preset-id", "e-heart");
    expect(badge).toHaveTextContent("heart");
  });

  it("is absent for players without one, when hidden or flag off", () => {
    const other = render(() => <QuickChatBadge playerId="me" />);
    expect(other.queryByTestId("mp-quickchat-badge")).toBeNull();
    other.unmount();
    Store.setQuickChatHiddenSignal(true);
    const hidden = render(() => <QuickChatBadge playerId="them" />);
    expect(hidden.queryByTestId("mp-quickchat-badge")).toBeNull();
    hidden.unmount();
    Store.setQuickChatHiddenSignal(false);
    clientFlags.clear();
    const off = render(() => <QuickChatBadge playerId="them" />);
    expect(off.queryByTestId("mp-quickchat-badge")).toBeNull();
  });
});

describe("QuickChatMuteButton", () => {
  beforeEach(() => {
    clientFlags.clear();
    clientFlags.add("quickChat");
    Store.setServerFeatures({
      characterSelect: false,
      openRooms: false,
      quickMatch: false,
      report: false,
      quickChat: true,
    });
    Store.setMyId("me");
    Store.setQuickChatHiddenSignal(false);
    Store.setMutedPlayersSignal(new Set<string>());
    race.toggleQuickChatMute.mockClear();
  });
  afterEach(() => {
    cleanup();
    Store.setRoom(undefined);
  });

  it("is hidden for ourselves, bots and players not in the room", () => {
    const room = setup();
    const { queryByTestId } = render(() => (
      <>
        <QuickChatMuteButton room={room} player={player("me")} />
        <QuickChatMuteButton room={room} player={player("bot1", true)} />
        <QuickChatMuteButton room={room} player={{ id: "bot1", name: "x" }} />
        <QuickChatMuteButton room={room} player={player("gone")} />
      </>
    ));
    expect(queryByTestId("mp-quickchat-mute")).toBeNull();
  });

  it("toggles and shows the muted chip", () => {
    const room = setup();
    const { getByTestId, queryByTestId } = render(() => (
      <QuickChatMuteButton room={room} player={player("them")} />
    ));
    const button = getByTestId("mp-quickchat-mute");
    expect(button).toHaveAttribute(
      "aria-label",
      "mute quick-chat from themPug",
    );
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(queryByTestId("mp-quickchat-muted-chip")).toBeNull();
    fireEvent.click(button);
    expect(race.toggleQuickChatMute).toHaveBeenCalledWith("them");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(getByTestId("mp-quickchat-muted-chip")).toHaveTextContent("muted");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(queryByTestId("mp-quickchat-muted-chip")).toBeNull();
  });

  it("is hidden while quick-chat is hidden or in an open room", () => {
    const room = setup();
    Store.setQuickChatHiddenSignal(true);
    const hidden = render(() => (
      <QuickChatMuteButton room={room} player={player("them")} />
    ));
    expect(hidden.queryByTestId("mp-quickchat-mute")).toBeNull();
    hidden.unmount();
    Store.setQuickChatHiddenSignal(false);
    Store.setRoom({ ...room, open: true });
    const open = render(() => (
      <QuickChatMuteButton room={room} player={player("them")} />
    ));
    expect(open.queryByTestId("mp-quickchat-mute")).toBeNull();
  });
});
