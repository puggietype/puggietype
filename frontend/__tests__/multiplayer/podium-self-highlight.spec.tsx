import { cleanup, render, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RaceResult, RoomState } from "../../src/ts/multiplayer/protocol";

vi.mock("../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: () => false,
}));
vi.mock("../../src/ts/multiplayer/race", () => ({
  backToLobby: vi.fn(),
  kickPlayer: vi.fn(),
  leaveRoom: vi.fn(),
  rematch: vi.fn(),
  reportPlayer: vi.fn(),
  setReady: vi.fn(),
  startRace: vi.fn(),
}));
vi.mock(
  "../../src/ts/components/pages/test/character-frames",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadCharacterSvg: vi.fn(async () => ""),
    prefetchCharacters: vi.fn(),
  }),
);

const Store = await import("../../src/ts/multiplayer/store");
const ThemeState = await import("../../src/ts/states/theme");
const { themes } = await import("../../src/ts/constants/themes");
const { Podium } = await import("../../src/ts/multiplayer/components/Podium");

const seat = (
  id: string,
  name: string,
  color: RoomState["players"][number]["color"],
): RoomState["players"][number] => ({
  id,
  name,
  isBot: false,
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
    seat("me", "ZippyPug42", "opp1"),
    seat("a", "Biscuit", "opp2"),
    seat("b", "Waffles", "opp3"),
  ],
};

const result = (playerId: string, place: number): RaceResult => ({
  playerId,
  name: ROOM.players.find((p) => p.id === playerId)?.name ?? playerId,
  isBot: false,
  place,
  wpm: 100 - place,
  raw: 100,
  acc: 98,
  testMs: 30000,
  finished: true,
  flagged: false,
  reasons: [],
});

/** results with "me" at the given place (1-based) among 3 */
const resultsWithMeAt = (place: number): RaceResult[] => {
  const ids = ["a", "b"];
  ids.splice(place - 1, 0, "me");
  return ids.map((id, i) => result(id, i + 1));
};

const rows = (container: HTMLElement): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>("[data-testid='mp-result-row']"),
];

describe("Podium own-row highlight", () => {
  beforeEach(() => {
    Store.setServerFeatures({
      characterSelect: false,
      openRooms: false,
      quickMatch: true,
      report: false,
    });
    Store.setMyId("me");
    Store.setRoom(ROOM);
    Store.setReports(new Map());
  });
  afterEach(() => cleanup());

  it.each([1, 2, 3])(
    "you placed %i: only your row is marked self, with pill, bold, aria",
    (place) => {
      const { container } = render(() => (
        <Podium room={ROOM} results={resultsWithMeAt(place)} />
      ));
      const all = rows(container);
      expect(all).toHaveLength(3);
      for (const row of all) {
        const self = row.getAttribute("data-player-id") === "me";
        const name = within(row).getByTestId("mp-result-name");
        const first = row.querySelector("td");
        if (self) {
          expect(row).toHaveAttribute("data-place", String(place));
          expect(row).toHaveAttribute("data-self", "true");
          expect(row).toHaveAttribute("aria-current", "true");
          expect(row.className).toContain("--main-color");
          expect(first?.className).toContain(
            "shadow-[inset_4px_0_0_var(--main-color)]",
          );
          expect(name).toHaveClass("font-bold");
          const pill = within(row).getByTestId("mp-result-you");
          expect(pill).toHaveTextContent("You");
          expect(pill).toHaveAttribute("aria-hidden", "true");
          expect(pill).toHaveClass("bg-main");
          expect(within(row).getByText("(you)")).toHaveClass("sr-only");
        } else {
          expect(row).not.toHaveAttribute("data-self");
          expect(row).not.toHaveAttribute("aria-current");
          expect(row.className).not.toContain("--main-color");
          expect(first?.className).not.toContain("shadow-");
          expect(name).not.toHaveClass("font-bold");
          expect(within(row).queryByTestId("mp-result-you")).toBeNull();
          expect(within(row).queryByText("(you)")).toBeNull();
        }
      }
    },
  );

  it("self and other rows share the same cell padding (no layout shift)", () => {
    const { container } = render(() => (
      <Podium room={ROOM} results={resultsWithMeAt(2)} />
    ));
    const pad = (row: HTMLElement): string[] =>
      [...row.querySelectorAll("td")].map((td) =>
        td.className
          .split(" ")
          .filter((c) => /(^|:)p[xy]?-/.test(c))
          .join(" "),
      );
    const [first, self, last] = rows(container) as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(self).toHaveAttribute("data-self", "true");
    expect(pad(self)).toEqual(pad(first));
    expect(pad(self)).toEqual(pad(last));
    // the bar is an inset shadow, never a border that adds width
    expect(self.querySelector("td")?.className).not.toMatch(/border-l/);
  });

  it("winning: You pill in the winner heading and (you) in its label", () => {
    const { getByTestId } = render(() => (
      <Podium room={ROOM} results={resultsWithMeAt(1)} />
    ));
    const heading = getByTestId("mp-winner");
    expect(heading).toHaveAttribute("data-self", "true");
    expect(heading).toHaveAttribute("aria-label", "ZippyPug42 (you) wins!");
    expect(getByTestId("mp-winner-you")).toHaveTextContent("You");
  });

  it.each([2, 3])(
    "placing %i: no winner pill, placed line highlighted",
    (place) => {
      const { getByTestId, queryByTestId } = render(() => (
        <Podium room={ROOM} results={resultsWithMeAt(place)} />
      ));
      const heading = getByTestId("mp-winner");
      expect(heading).not.toHaveAttribute("data-self");
      expect(heading.getAttribute("aria-label")).not.toContain("(you)");
      expect(queryByTestId("mp-winner-you")).toBeNull();
      const line = getByTestId("mp-my-placed");
      expect(line.className).toContain("--main-color");
      expect(line.className).toContain(
        "shadow-[inset_4px_0_0_var(--main-color)]",
      );
      expect(getByTestId("mp-my-place")).toHaveTextContent(
        place === 2 ? "2nd" : "3rd",
      );
    },
  );

  it("sets the tint and pill text variables from the theme", () => {
    const { getByTestId } = render(() => (
      <Podium room={ROOM} results={resultsWithMeAt(1)} />
    ));
    const podium = getByTestId("mp-podium");
    expect(podium.style.getPropertyValue("--self-tint")).toMatch(/^\d+%$/);
    expect(podium.style.getPropertyValue("--self-pill-text")).not.toBe("");
  });

  describe("SH-01: colors on your row fall back to text where they'd miss AA", () => {
    const original = ThemeState.getTheme();
    afterEach(() => ThemeState.setTheme(original));
    const flagged = (): RaceResult[] =>
      resultsWithMeAt(2).map((r) => ({
        ...r,
        flagged: true,
        reasons: ["wpm_mismatch"],
      }));
    const cells = (
      row: HTMLElement,
    ): { rank: HTMLElement; raw: HTMLElement; flag: HTMLElement } => {
      const td = [...row.querySelectorAll("td")];
      return {
        rank: td[0] as HTMLElement,
        raw: td[3] as HTMLElement,
        flag: within(row).getByTestId("mp-result-flagged"),
      };
    };

    it("puggie_dark: raw and flag use text on your row only, rank keeps opp1", () => {
      ThemeState.setTheme({ ...themes.puggie_dark, name: "puggie_dark" });
      const { container } = render(() => (
        <Podium room={ROOM} results={flagged()} />
      ));
      for (const row of rows(container)) {
        const c = cells(row);
        if (row.getAttribute("data-self") === "true") {
          expect(c.raw).toHaveClass("text-text");
          expect(c.raw).not.toHaveClass("text-sub");
          expect(c.flag).toHaveClass("text-text");
          expect(c.rank).toHaveClass("text-opp1");
        } else {
          expect(c.raw).toHaveClass("text-sub");
          expect(c.flag).toHaveClass("text-error");
        }
      }
    });

    it("puggie_light: your rank (opp1) falls back to text, others keep their color", () => {
      ThemeState.setTheme({ ...themes.puggie_light, name: "puggie_light" });
      const { container } = render(() => (
        <Podium room={ROOM} results={flagged()} />
      ));
      const [a, me, b] = rows(container) as [
        HTMLElement,
        HTMLElement,
        HTMLElement,
      ];
      expect(cells(me).rank).toHaveClass("text-text");
      expect(cells(a).rank).toHaveClass("text-opp2");
      expect(cells(b).rank).toHaveClass("text-opp3");
    });
  });
});
