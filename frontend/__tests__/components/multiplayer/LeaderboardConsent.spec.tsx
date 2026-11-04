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
  let now = 0;

  beforeEach(() => {
    now = 10_000;
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

  const renderSubmit = (): ReturnType<typeof render> =>
    render(() => <SoloLeaderboardSubmit score={score} now={() => now} />);

  it("drops the score when Submit is clicked before 2 seconds", () => {
    const { getByTestId, unmount } = renderSubmit();
    now = 11_000;
    fireEvent.click(getByTestId("lb-submit"));
    expect(getByTestId("lb-submit-status")).toHaveTextContent(
      "Score not submitted.",
    );
    unmount();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not submit on unmount", () => {
    const { unmount } = renderSubmit();
    now = 20_000;
    unmount();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the toggle on Submit score after the toggle has been visible for 2s", async () => {
    const { getByTestId } = renderSubmit();
    const box = getByTestId<HTMLInputElement>("lb-show-score");
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    now = 12_000;
    fireEvent.click(getByTestId("lb-submit"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = postedBody();
    expect(body).toMatchObject({
      showOnLeaderboard: false,
      wpm: 88,
      mode2: 30,
    });
    expect(body).not.toHaveProperty("playerId");
    expect(body).not.toHaveProperty("sessionToken");
  });

  it("sends on Next after 2s and drops Next before that", async () => {
    const early = renderSubmit();
    now = 11_000;
    requestSoloSubmit("next");
    expect(fetch).not.toHaveBeenCalled();
    early.unmount();

    now = 30_000;
    renderSubmit();
    now = 32_000;
    requestSoloSubmit("retry");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(postedBody()).toMatchObject({ showOnLeaderboard: true, wpm: 88 });
  });

  it("does not submit from the kids guide flow", () => {
    sessionStorage.setItem(KIDS_FLOW_KEY, "1");
    const { getByTestId, unmount } = renderSubmit();
    now = 20_000;
    fireEvent.click(getByTestId("lb-submit"));
    requestSoloSubmit("next");
    unmount();
    expect(fetch).not.toHaveBeenCalled();
  });
});
