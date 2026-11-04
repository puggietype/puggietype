import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  LeaderboardQuery,
  LeaderboardResult,
} from "../../../src/ts/multiplayer/leaderboards";

import { LeaderboardView } from "../../../src/ts/multiplayer/components/LeaderboardView";
import { setServerFeatures } from "../../../src/ts/multiplayer/store";

type Load = (
  base: string,
  query: LeaderboardQuery,
  signal?: AbortSignal,
) => Promise<LeaderboardResult>;

const featuresOn = {
  characterSelect: false,
  openRooms: false,
  quickMatch: false,
  report: false,
  leaderboards: true,
};

function board(names: string[]): Extract<LeaderboardResult, { ok: true }> {
  return {
    ok: true as const,
    period: "daily" as const,
    periodKey: "2026-11-04",
    startsAt: Date.UTC(2026, 10, 4),
    endsAt: Date.UTC(2026, 10, 5),
    mode: "time" as const,
    mode2: 30,
    accuracyFloor: 75,
    entries: names.map((name, i) => ({
      rank: i + 1,
      name,
      wpm: 100 - i,
      acc: 98,
      raw: 110 - i,
    })),
  };
}

function loadWith(body: LeaderboardResult): ReturnType<typeof vi.fn<Load>> {
  return vi.fn<Load>(async () => body);
}

describe("LeaderboardView", () => {
  afterEach(() => {
    cleanup();
    setServerFeatures(undefined);
  });

  it("stays hidden when the server has no leaderboards", () => {
    const { queryByTestId } = render(() => (
      <LeaderboardView variant="page" load={loadWith(board(["A"]))} />
    ));
    expect(queryByTestId("lb-view")).toBeNull();
  });

  it("shows loading, then rows, and highlights your nickname", async () => {
    setServerFeatures(featuresOn);
    let resolve: (value: LeaderboardResult) => void = () => undefined;
    const load = vi.fn<Load>(
      async () =>
        await new Promise<LeaderboardResult>((done) => {
          resolve = done;
        }),
    );
    const { getByTestId, findByTestId, getAllByTestId } = render(() => (
      <LeaderboardView variant="page" load={load} />
    ));
    expect(getByTestId("lb-loading")).toHaveTextContent("Loading leaderboard");
    const ready = board(["OtherPug", "ZippyPug"]);
    const mine = ready.entries[1];
    if (mine !== undefined) ready.entries[1] = { ...mine, isYou: true };
    resolve(ready);
    await findByTestId("lb-table");
    const rows = getAllByTestId("lb-row");
    expect(rows[1]?.getAttribute("data-self")).toBe("true");
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(rows[1]).toHaveTextContent("(you)");
    expect(getByTestId("lb-you")).toBeTruthy();
    expect(rows[0]?.hasAttribute("data-self")).toBe(false);
    // LB-002: raw uses the text color on your own tinted row, sub elsewhere
    const raws = getAllByTestId("lb-raw");
    expect(raws[1]).toHaveClass("text-text");
    expect(raws[1]).not.toHaveClass("text-sub");
    expect(raws[0]).toHaveClass("text-sub");
    // LB-001: a horizontally scrollable table is a labelled, focusable region
    const scroll = getByTestId("lb-scroll");
    expect(scroll).toHaveAttribute("role", "region");
    expect(scroll).toHaveAttribute("tabindex", "0");
    expect(scroll.getAttribute("aria-label")).toMatch(
      /^Multiplayer .+ leaderboard$/,
    );
    // narrow screens: tighter cells, and long names truncate instead of widening the table
    expect(getAllByTestId("lb-name")[0]?.closest("td")).toHaveClass("max-w-0");
  });

  it("shows an empty board", async () => {
    setServerFeatures(featuresOn);
    const { findByTestId } = render(() => (
      <LeaderboardView variant="compact" load={loadWith(board([]))} />
    ));
    expect(await findByTestId("lb-empty")).toHaveTextContent(
      "No scores for this board yet.",
    );
  });

  it("shows an error and retries", async () => {
    setServerFeatures(featuresOn);
    const load = vi
      .fn<Load>()
      .mockResolvedValueOnce({ ok: false, error: "closed" })
      .mockResolvedValueOnce(board(["A"]));
    const { findByTestId, getByTestId } = render(() => (
      <LeaderboardView variant="page" load={load} />
    ));
    expect(await findByTestId("lb-error")).toHaveTextContent("closed");
    fireEvent.click(getByTestId("lb-retry"));
    await findByTestId("lb-table");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("has a monthly tab and mode selectors that refetch", async () => {
    setServerFeatures(featuresOn);
    const load = loadWith(board(["A"]));
    const { findByTestId, getByTestId } = render(() => (
      <LeaderboardView variant="page" load={load} />
    ));
    await findByTestId("lb-table");
    expect(getByTestId("lb-tab-monthly")).toHaveAttribute("role", "radio");
    expect(getByTestId("lb-tab-daily")).toHaveAttribute("aria-checked", "true");
    expect(getByTestId("lb-tab-daily")).toHaveAttribute("tabindex", "0");
    expect(getByTestId("lb-tab-weekly")).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(getByTestId("lb-tab-daily"), { key: "ArrowRight" });
    expect(getByTestId("lb-tab-weekly")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.activeElement).toBe(getByTestId("lb-tab-weekly"));
    fireEvent.keyDown(getByTestId("lb-mode-time"), { key: "ArrowRight" });
    expect(getByTestId("lb-mode-words")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.activeElement).toBe(getByTestId("lb-mode-words"));
    fireEvent.click(getByTestId("lb-tab-monthly"));
    expect(getByTestId("lb-tab-monthly")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(getByTestId("lb-mode-words"));
    fireEvent.click(getByTestId("lb-mode2-50"));
    await vi.waitFor(() => {
      const last = load.mock.calls.at(-1)?.[1] as LeaderboardQuery;
      expect(last).toMatchObject({
        period: "monthly",
        mode: "words",
        mode2: 50,
        verified: true,
      });
    });
  });

  it("shows solo scores on their own tab and does not merge them", async () => {
    setServerFeatures(featuresOn);
    const load = vi.fn<Load>(async (_base, query) => {
      if (!query.verified) {
        return { ...board(["SoloPug"]), verified: false };
      }
      return { ...board(["RacePug"]), verified: true };
    });
    const { findByText, getByTestId, queryByText, queryByTestId } = render(
      () => <LeaderboardView variant="page" load={load} />,
    );
    expect(await findByText("RacePug")).toBeTruthy();
    expect(queryByText("SoloPug")).toBeNull();
    expect(queryByTestId("lb-solo-note")).toBeNull();
    expect(getByTestId("lb-board-solo")).toHaveTextContent(/^Solo$/);
    expect(getByTestId("lb-board-race")).toHaveTextContent(/^Multiplayer$/);
    fireEvent.click(getByTestId("lb-board-solo"));
    expect(await findByText("SoloPug")).toBeTruthy();
    expect(queryByText("RacePug")).toBeNull();
    expect(getByTestId("lb-solo-note")).toHaveTextContent(
      "Solo scores are self-reported and checked for plausibility, not verified.",
    );
    const urls = load.mock.calls.map((call) => call[1].verified);
    expect(urls).toEqual([true, false]);
  });

  it("shows the Solo note as soon as the Solo tab is open, even before the board loads", async () => {
    setServerFeatures(featuresOn);
    const load = vi.fn<Load>(async (_base, query) => {
      if (query.verified) return { ...board(["RacePug"]), verified: true };
      return new Promise(() => undefined);
    });
    const { findByText, getByTestId, queryByTestId } = render(() => (
      <LeaderboardView variant="page" load={load} />
    ));
    expect(await findByText("RacePug")).toBeTruthy();
    expect(queryByTestId("lb-solo-note")).toBeNull();
    fireEvent.click(getByTestId("lb-board-solo"));
    const note = getByTestId("lb-solo-note");
    expect(note).toBeVisible();
    expect(note.tagName).toBe("P");
    expect(note).toHaveTextContent(
      "Solo scores are self-reported and checked for plausibility, not verified.",
    );
  });
});
