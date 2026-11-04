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
    expect(getByTestId("lb-tab-monthly")).toHaveAttribute("role", "tab");
    expect(getByTestId("lb-tab-daily")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(getByTestId("lb-tab-monthly"));
    expect(getByTestId("lb-tab-monthly")).toHaveAttribute(
      "aria-selected",
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
      });
    });
  });
});
