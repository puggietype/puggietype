import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SoloLeaderboardSubmit } from "../../../src/ts/multiplayer/components/SoloLeaderboardSubmit";
import { setShowOnLeaderboard } from "../../../src/ts/multiplayer/leaderboard-pref";
import { KIDS_FLOW_KEY } from "../../../src/ts/multiplayer/leaderboards";

const score = {
  mode: "time" as const,
  mode2: 30,
  language: "english",
  punctuation: false,
  numbers: false,
  wpm: 88,
  acc: 99,
  raw: 90,
};

describe("SoloLeaderboardSubmit", () => {
  beforeEach(() => {
    setShowOnLeaderboard(true);
    sessionStorage.removeItem(KIDS_FLOW_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionStorage.removeItem(KIDS_FLOW_KEY);
    setShowOnLeaderboard(true);
  });

  it("is on by default and sends the toggle value from the results screen", async () => {
    const { getByTestId } = render(() => (
      <SoloLeaderboardSubmit score={score} />
    ));
    const box = getByTestId<HTMLInputElement>("lb-show-score");
    expect(box.checked).toBe(true);
    expect(box).toHaveAccessibleName("Show my score on the leaderboard");
    fireEvent.click(box);
    fireEvent.click(getByTestId("lb-submit"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({
      showOnLeaderboard: false,
      wpm: 88,
      mode2: 30,
    });
  });

  it("does not submit from the kids guide flow", () => {
    sessionStorage.setItem(KIDS_FLOW_KEY, "1");
    const { getByTestId, unmount } = render(() => (
      <SoloLeaderboardSubmit score={score} />
    ));
    fireEvent.click(getByTestId("lb-submit"));
    unmount();
    expect(fetch).not.toHaveBeenCalled();
  });
});
