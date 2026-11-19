import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
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
  chars: 210,
  durationMs: 15_000,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function expectSubmitBlocked(button: HTMLElement): void {
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).not.toHaveAttribute("disabled");
}

function expectSubmitReady(button: HTMLElement): void {
  expect(button).toHaveAttribute("aria-disabled", "false");
  expect(button).not.toHaveAttribute("disabled");
}

function postedBody(call = 0): Record<string, unknown> | undefined {
  const init = vi.mocked(fetch).mock.calls[call]?.[1];
  if (init === undefined || !isRecord(init)) return undefined;
  const raw = init["body"];
  if (typeof raw !== "string") return undefined;
  const parsed: unknown = JSON.parse(raw);
  return isRecord(parsed) ? parsed : undefined;
}

function installButtonOpacityCss(): HTMLStyleElement {
  const style = document.createElement("style");
  // Same conflict the app has: the dim utility is declared after opacity-100,
  // and button[disabled] also sets 0.33. !opacity-100 must still compute to 1.
  style.textContent = `
    button[disabled], button.disabled { opacity: 0.33; }
    .opacity-100 { opacity: 1; }
    .opacity-\\[0\\.33\\] { opacity: 0.33; }
    .\\!opacity-100 { opacity: 1 !important; }
  `;
  document.head.appendChild(style);
  return style;
}

describe("SoloLeaderboardSubmit", () => {
  let opacityCss: HTMLStyleElement | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    setShowOnLeaderboard(true);
    sessionStorage.removeItem(KIDS_FLOW_KEY);
    opacityCss = installButtonOpacityCss();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
  });
  afterEach(() => {
    cleanup();
    opacityCss?.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.removeItem(KIDS_FLOW_KEY);
    setShowOnLeaderboard(true);
  });

  const renderSubmit = (
    props: Partial<Parameters<typeof SoloLeaderboardSubmit>[0]> = {},
  ): ReturnType<typeof render> =>
    render(() => (
      <SoloLeaderboardSubmit score={score} availability="on" {...props} />
    ));

  it("has no browse filters and posts the finished test after Submit score", async () => {
    const { getByTestId, queryByTestId } = renderSubmit();
    expect(queryByTestId("lb-view")).toBeNull();
    expect(queryByTestId("lb-mode-time")).toBeNull();
    expect(queryByTestId("lb-board-race")).toBeNull();
    expect(queryByTestId("lb-tab-daily")).toBeNull();
    expect(queryByTestId("lb-language")).toBeNull();
    expect(queryByTestId("lb-punctuation")).toBeNull();
    expect(getByTestId("lb-settings")).toHaveTextContent("english · 30s");
    expect(getByTestId("lb-solo-note")).toHaveTextContent("not verified");
    expect(getByTestId("lb-browse")).toHaveAttribute(
      "href",
      "/leaderboards?period=daily&mode=time&mode2=30&language=english&punctuation=false&numbers=false",
    );

    const button = getByTestId("lb-submit");
    expect(button).toHaveAttribute("type", "button");
    expectSubmitBlocked(button);
    expect(button).toHaveTextContent("Submit score");
    expect(getByTestId("lb-submit-reason")).toHaveTextContent(
      "You can submit this score in a moment.",
    );
    fireEvent.click(button);
    expect(fetch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expectSubmitReady(button);
    fireEvent.click(button);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = postedBody();
    expect(body).toMatchObject({
      showOnLeaderboard: true,
      wpm: 88,
      mode: "time",
      mode2: 30,
      language: "english",
      punctuation: false,
      numbers: false,
    });
    expect(body).not.toHaveProperty("playerId");
    await vi.waitFor(() =>
      expect(getByTestId("lb-submit-status")).toHaveTextContent(
        "Score submitted.",
      ),
    );
    expectSubmitBlocked(button);
  });

  it("keeps the finished test when a later score object changes", async () => {
    const [live, setLive] = createSignal({ ...score, mode2: 30, wpm: 88 });
    const { getByTestId } = render(() => (
      <SoloLeaderboardSubmit score={live()} availability="on" />
    ));
    setLive({
      ...score,
      mode2: 15,
      language: "french",
      punctuation: true,
      numbers: true,
      wpm: 10,
    });
    expect(getByTestId("lb-settings")).toHaveTextContent("english · 30s");
    expect(getByTestId("lb-browse").getAttribute("href")).toContain("mode2=30");
    expect(getByTestId("lb-browse").getAttribute("href")).not.toContain(
      "french",
    );
    vi.advanceTimersByTime(2000);
    fireEvent.click(getByTestId("lb-submit"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(postedBody()).toMatchObject({
      mode: "time",
      mode2: 30,
      language: "english",
      wpm: 88,
      punctuation: false,
      numbers: false,
    });
  });

  it("sends the checkbox the player sets, not a click by itself", async () => {
    const { getByTestId } = renderSubmit();
    const box = getByTestId<HTMLInputElement>("lb-show-score");
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    vi.advanceTimersByTime(5000);
    requestSoloSubmit("next");
    requestSoloSubmit("retry");
    requestSoloSubmit("submit");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(getByTestId("lb-submit"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(postedBody()).toMatchObject({ showOnLeaderboard: false, wpm: 88 });
  });

  it("does not submit on unmount or from a remembered checkbox alone", () => {
    setShowOnLeaderboard(true);
    const { unmount } = renderSubmit();
    vi.advanceTimersByTime(5000);
    unmount();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not double-submit while the first request is in flight", async () => {
    let resolve: (value: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return await new Promise<Response>((done) => {
          resolve = done;
        });
      }),
    );
    const { getByTestId } = renderSubmit();
    vi.advanceTimersByTime(2000);
    const button = getByTestId("lb-submit");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(button).toHaveTextContent("Submitting…");
    expectSubmitBlocked(button);
    resolve(new Response("{}", { status: 200 }));
    await vi.waitFor(() =>
      expect(getByTestId("lb-submit-status")).toHaveTextContent(
        "Score submitted.",
      ),
    );
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not call a score submitted when the server did not add it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ ok: true, recorded: false }), {
          status: 200,
        });
      }),
    );
    const { getByTestId } = renderSubmit();
    const box = getByTestId<HTMLInputElement>("lb-show-score");
    fireEvent.click(box);
    vi.advanceTimersByTime(2000);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(getByTestId("lb-submit"));
    const status = getByTestId("lb-submit-status");
    await vi.waitFor(() =>
      expect(status).toHaveTextContent(
        "This score was not added to the board.",
      ),
    );
    expect(status).not.toHaveTextContent("Score submitted.");
    expect(postedBody()).toMatchObject({ showOnLeaderboard: false, wpm: 88 });
    expectSubmitReady(getByTestId("lb-submit"));
    expect(getByTestId("lb-submit")).toHaveTextContent("Submit score");
  });

  it("shows a failure and allows one later retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: false, error: "closed" }), {
            status: 503,
          }),
        )
        .mockResolvedValueOnce(new Response("{}", { status: 200 })),
    );
    const { getByTestId } = renderSubmit();
    vi.advanceTimersByTime(2000);
    fireEvent.click(getByTestId("lb-submit"));
    await vi.waitFor(() =>
      expect(getByTestId("lb-submit-status")).toHaveTextContent(
        "Couldn't submit your score. Try again.",
      ),
    );
    expectSubmitReady(getByTestId("lb-submit"));
    fireEvent.click(getByTestId("lb-submit"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(getByTestId("lb-submit-status")).toHaveTextContent(
        "Score submitted.",
      ),
    );
  });

  it("does not submit from the kids guide flow", () => {
    sessionStorage.setItem(KIDS_FLOW_KEY, "1");
    const { getByTestId } = renderSubmit();
    vi.advanceTimersByTime(2000);
    const button = getByTestId("lb-submit");
    expectSubmitBlocked(button);
    expect(getByTestId("lb-submit-reason")).toHaveTextContent(
      "kids guides aren't submitted",
    );
    fireEvent.click(button);
    requestSoloSubmit("next");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("explains an ineligible test without posting", () => {
    const { getByTestId, queryByTestId } = render(() => (
      <SoloLeaderboardSubmit availability="on" />
    ));
    vi.advanceTimersByTime(2000);
    expectSubmitBlocked(getByTestId("lb-submit"));
    expect(getByTestId("lb-submit-reason")).toHaveTextContent(
      "can't be submitted to ranks",
    );
    expect(queryByTestId("lb-mode-time")).toBeNull();
    fireEvent.click(getByTestId("lb-submit"));
    expect(fetch).not.toHaveBeenCalled();
    expect(getByTestId("lb-browse")).toHaveAttribute("href", "/leaderboards");
  });

  it("keeps Submit focusable and focused while sending and posts once", async () => {
    let resolve: (value: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return await new Promise<Response>((done) => {
          resolve = done;
        });
      }),
    );
    const { getByTestId } = renderSubmit();
    vi.advanceTimersByTime(2000);
    const button = getByTestId<HTMLButtonElement>("lb-submit");
    button.focus();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(false);
    expect(button).not.toHaveAttribute("disabled");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.className).toContain("opacity-[0.33]");
    expect(document.activeElement).toBe(button);
    expect(document.activeElement).not.toBe(document.body);
    expect(getByTestId("lb-submit-status").textContent).toBe("Submitting…");

    resolve(new Response("{}", { status: 200 }));
    await vi.waitFor(() =>
      expect(getByTestId("lb-submit-status").textContent).toBe(
        "Score submitted.",
      ),
    );
    expect(button.disabled).toBe(false);
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("announces from one persistent status live region", async () => {
    let resolve: (value: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return await new Promise<Response>((done) => {
          resolve = done;
        });
      }),
    );
    const { getByTestId, getAllByRole, queryByTestId } = renderSubmit();
    const status = getByTestId("lb-submit-status");
    expect(getAllByRole("status")).toEqual([status]);
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.textContent).toBe("");
    expect(queryByTestId("lb-submit-reason")).not.toHaveAttribute("aria-live");

    vi.advanceTimersByTime(2000);
    fireEvent.click(getByTestId("lb-submit"));
    expect(status.textContent).toBe("Submitting…");
    expect(queryByTestId("lb-submit-reason")).toBeNull();
    expect(getAllByRole("status")).toHaveLength(1);

    resolve(new Response("{}", { status: 200 }));
    await vi.waitFor(() => expect(status.textContent).toBe("Score submitted."));
    expect(getAllByRole("status")).toEqual([status]);
  });

  it("shows a retry cue after an error and a later retry posts once", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: false, error: "closed" }), {
            status: 503,
          }),
        )
        .mockResolvedValueOnce(new Response("{}", { status: 200 })),
    );
    const { getByTestId } = renderSubmit();
    const status = getByTestId("lb-submit-status");
    expect(status.textContent).toBe("");
    vi.advanceTimersByTime(2000);
    const button = getByTestId<HTMLButtonElement>("lb-submit");
    fireEvent.click(button);
    expect(status.textContent).toBe("Submitting…");
    await vi.waitFor(() =>
      expect(status.textContent).toBe("Couldn't submit your score. Try again."),
    );
    expect(button).toHaveAttribute("aria-disabled", "false");
    expect(button.disabled).toBe(false);
    expect(button.className).toContain("!opacity-100");
    expect(button.className).not.toContain("opacity-[0.33]");
    expect(getComputedStyle(button).opacity).toBe("1");
    expect(fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(button);
    fireEvent.click(button);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(status.textContent).toBe("Score submitted."));
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("uses retry copy for a 500 and server text for 429 and 400", async () => {
    const cases = [
      {
        status: 500,
        error: "database unavailable",
        text: "Couldn't submit your score. Try again.",
        retry: true,
      },
      {
        status: 429,
        error: "Too many scores. Slow down.",
        text: "Too many scores. Slow down.",
        retry: false,
      },
      {
        status: 400,
        error: "wpm is invalid",
        text: "wpm is invalid",
        retry: false,
      },
    ] as const;
    for (const next of cases) {
      cleanup();
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ ok: false, error: next.error }), {
              status: next.status,
            }),
        ),
      );
      const { getByTestId } = renderSubmit();
      vi.advanceTimersByTime(2000);
      const button = getByTestId<HTMLButtonElement>("lb-submit");
      const status = getByTestId("lb-submit-status");
      fireEvent.click(button);
      await vi.waitFor(() => expect(status.textContent).toBe(next.text));
      expect(status.textContent).not.toContain(
        next.retry ? "database" : "Try again",
      );
      expect(button).toHaveAttribute(
        "aria-disabled",
        next.retry ? "false" : "true",
      );
      expect(button.disabled).toBe(false);
      expect(getComputedStyle(button).opacity).toBe(next.retry ? "1" : "0.33");
      fireEvent.click(button);
      expect(fetch).toHaveBeenCalledTimes(next.retry ? 2 : 1);
    }
  });

  it("uses retry copy when the network throws and posts once more", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(new Response("{}", { status: 200 })),
    );
    const { getByTestId } = renderSubmit();
    vi.advanceTimersByTime(2000);
    const button = getByTestId<HTMLButtonElement>("lb-submit");
    const status = getByTestId("lb-submit-status");
    fireEvent.click(button);
    await vi.waitFor(() =>
      expect(status.textContent).toBe("Couldn't submit your score. Try again."),
    );
    expect(button).toHaveAttribute("aria-disabled", "false");
    expect(getComputedStyle(button).opacity).toBe("1");
    fireEvent.click(button);
    fireEvent.click(button);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(status.textContent).toBe("Score submitted."));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reaches Score submitted after a delayed response and extra activations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1500);
        });
        return new Response("{}", { status: 200 });
      }),
    );
    const { getByTestId } = renderSubmit();
    vi.advanceTimersByTime(2000);
    const button = getByTestId<HTMLButtonElement>("lb-submit");
    const status = getByTestId("lb-submit-status");
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(status.textContent).toBe("Submitting…");
    expect(button).toHaveAttribute("aria-disabled", "true");
    await vi.advanceTimersByTimeAsync(1500);
    await vi.waitFor(() => expect(status.textContent).toBe("Score submitted."));
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(status.textContent).toBe("Score submitted.");
  });
});
