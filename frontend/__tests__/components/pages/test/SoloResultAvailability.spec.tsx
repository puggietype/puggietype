import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InGameLeaderboard } from "../../../../src/ts/components/pages/test/result/SoloResultScore";
import { KIDS_FLOW_KEY } from "../../../../src/ts/multiplayer/leaderboards";
import {
  setConnectionStatus,
  setServerFeatures,
} from "../../../../src/ts/multiplayer/store";

const featuresOn = {
  characterSelect: false,
  openRooms: false,
  quickMatch: false,
  report: false,
  leaderboards: true,
};

const valid = {
  mode: "words",
  mode2: "10",
  language: "english",
  punctuation: false,
  numbers: false,
  wpm: 196,
  acc: 100,
  rawWpm: 200,
  charStats: [50, 0, 0, 0] as const,
  testDuration: 2.949,
};

function expectSubmitBlocked(button: HTMLElement): void {
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).not.toHaveAttribute("disabled");
}

function expectSubmitReady(button: HTMLElement): void {
  expect(button).toHaveAttribute("aria-disabled", "false");
  expect(button).not.toHaveAttribute("disabled");
}

describe("first solo result availability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem("puggie-mp-age-confirmed", "true");
    sessionStorage.removeItem(KIDS_FLOW_KEY);
    setServerFeatures(undefined);
    setConnectionStatus("connecting");
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
    setServerFeatures(undefined);
    setConnectionStatus("idle");
  });

  it("leaves checking when a delayed welcome arrives for a valid result", async () => {
    const { getByTestId, queryByTestId } = render(() => (
      <InGameLeaderboard result={valid} invalid={false} />
    ));
    expectSubmitBlocked(getByTestId("lb-submit"));
    expect(getByTestId("lb-submit-reason")).toHaveTextContent(
      "Checking whether ranks are on…",
    );
    vi.advanceTimersByTime(2500);
    expect(getByTestId("lb-submit-reason")).toHaveTextContent(
      "Checking whether ranks are on…",
    );
    expect(fetch).not.toHaveBeenCalled();

    setServerFeatures(featuresOn);
    setConnectionStatus("open");
    expect(queryByTestId("lb-submit-reason")?.textContent ?? "").not.toMatch(
      /Checking/,
    );
    expectSubmitReady(getByTestId("lb-submit"));
    fireEvent.click(getByTestId("lb-submit"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    const raw = init && "body" in init ? init.body : undefined;
    if (typeof raw !== "string") throw new Error("expected a string body");
    const body = JSON.parse(raw);
    expect(body).toMatchObject({
      mode: "words",
      mode2: 10,
      language: "english",
      wpm: 196,
      chars: 50,
      showOnLeaderboard: true,
    });
  });

  it("shows the wait reason, not checking, when welcome arrives before 2s", () => {
    const { getByTestId } = render(() => (
      <InGameLeaderboard result={valid} invalid={false} />
    ));
    vi.advanceTimersByTime(400);
    setServerFeatures(featuresOn);
    setConnectionStatus("open");
    expect(getByTestId("lb-submit-reason")).toHaveTextContent(
      "You can submit this score in a moment.",
    );
    expectSubmitBlocked(getByTestId("lb-submit"));
    fireEvent.click(getByTestId("lb-submit"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves checking for an invalid result without posting", () => {
    const { getByTestId } = render(() => (
      <InGameLeaderboard result={valid} invalid={true} />
    ));
    expect(getByTestId("lb-submit-reason")).toHaveTextContent(
      "Checking whether ranks are on…",
    );
    setServerFeatures(featuresOn);
    setConnectionStatus("open");
    vi.advanceTimersByTime(3000);
    expect(getByTestId("lb-submit-reason")).toHaveTextContent(
      "This result can't be submitted.",
    );
    expectSubmitBlocked(getByTestId("lb-submit"));
    fireEvent.click(getByTestId("lb-submit"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not post from next or unmount while waiting for welcome", () => {
    const { unmount } = render(() => (
      <InGameLeaderboard result={valid} invalid={false} />
    ));
    vi.advanceTimersByTime(5000);
    unmount();
    expect(fetch).not.toHaveBeenCalled();
  });
});
