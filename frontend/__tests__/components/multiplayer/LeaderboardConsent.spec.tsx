import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SoloLeaderboardSubmit } from "../../../src/ts/multiplayer/components/SoloLeaderboardSubmit";
import { setShowOnLeaderboard } from "../../../src/ts/multiplayer/leaderboard-pref";
import {
  KIDS_FLOW_KEY,
  requestSoloSubmit,
} from "../../../src/ts/multiplayer/leaderboards";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function postedBody(): Record<string, unknown> | undefined {
  const init = vi.mocked(fetch).mock.calls[0]?.[1];
  if (init === undefined || !isRecord(init)) return undefined;
  const raw = init["body"];
  if (typeof raw !== "string") return undefined;
  const parsed: unknown = JSON.parse(raw);
  return isRecord(parsed) ? parsed : undefined;
}

describe("SoloLeaderboardSubmit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setShowOnLeaderboard(true);
    sessionStorage.removeItem(KIDS_FLOW_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.removeItem(KIDS_FLOW_KEY);
    setShowOnLeaderboard(true);
  });

  const renderSubmit = (): ReturnType<typeof render> =>
    render(() => <SoloLeaderboardSubmit score={score} />);

  it("keeps Submit score disabled for 2s, then sends the toggle", async () => {
    const { getByTestId } = renderSubmit();
    const button = getByTestId("lb-submit");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(fetch).not.toHaveBeenCalled();
    const box = getByTestId<HTMLInputElement>("lb-show-score");
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    vi.advanceTimersByTime(2000);
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = postedBody();
    expect(body).toMatchObject({
      showOnLeaderboard: false,
      wpm: 88,
      mode2: 30,
    });
    expect(body).not.toHaveProperty("playerId");
  });

  it("does not submit on unmount", () => {
    const { unmount } = renderSubmit();
    vi.advanceTimersByTime(2000);
    unmount();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores Next before 2s and still sends a later Retry", async () => {
    renderSubmit();
    requestSoloSubmit("next");
    expect(fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    requestSoloSubmit("retry");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(postedBody()).toMatchObject({ showOnLeaderboard: true, wpm: 88 });
  });

  it("does not submit from the kids guide flow", () => {
    sessionStorage.setItem(KIDS_FLOW_KEY, "1");
    const { getByTestId, unmount } = renderSubmit();
    vi.advanceTimersByTime(2000);
    fireEvent.click(getByTestId("lb-submit"));
    requestSoloSubmit("next");
    unmount();
    expect(fetch).not.toHaveBeenCalled();
  });
});
