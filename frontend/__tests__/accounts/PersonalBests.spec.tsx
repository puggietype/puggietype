import { fireEvent, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ callWithIdToken: vi.fn() }));
vi.mock("../../src/ts/accounts/authed-call", () => session);

import { setPersonalBestsVersion } from "../../src/ts/accounts/state";
import { accountsCopy } from "../../src/ts/accounts/strings";
import { PersonalBests } from "../../src/ts/accounts/ui/PersonalBests";

const copy = accountsCopy.personalBests;

const pb = {
  mode: "time",
  mode2: "60",
  language: "english",
  punctuation: false,
  numbers: false,
  wpm: 85.43,
  rawWpm: 90,
  acc: 97.24,
  consistency: 70,
  achievedAt: "2026-11-18T10:00:00.000Z",
};

function answer(value: unknown): void {
  session.callWithIdToken.mockResolvedValue(value);
}

beforeEach(() => {
  answer({ ok: true, personalBests: [] });
});

afterEach(() => vi.clearAllMocks());

describe("PersonalBests", () => {
  it("loading, then the rows in the server's order with dates", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    session.callWithIdToken.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container, findByText } = render(() => <PersonalBests />);
    expect(container.textContent).toContain(copy.loading);
    resolve({
      ok: true,
      personalBests: [
        pb,
        {
          ...pb,
          mode: "words",
          mode2: "25",
          language: "english_1k",
          punctuation: true,
          wpm: 101,
          acc: 100,
          achievedAt: "2026-10-02T10:00:00.000Z",
        },
      ],
    });
    await findByText("time 60 english, 85.4 wpm, 97.2% acc");
    const rows = [...container.querySelectorAll("li")].map(
      (li) => li.textContent,
    );
    expect(rows).toEqual([
      "time 60 english, 85.4 wpm, 97.2% acc18 Nov 2026",
      "words 25 english 1k punctuation, 101 wpm, 100% acc2 Oct 2026",
    ]);
    expect(container.textContent).not.toContain(copy.loading);
  });

  it("empty", async () => {
    const { findByText } = render(() => <PersonalBests />);
    await findByText(copy.empty);
  });

  it("error, with a retry", async () => {
    answer({ ok: false, status: 503, code: "", message: "server said x" });
    const { container, findByText } = render(() => <PersonalBests />);
    await findByText(copy.error);
    // fixed text only
    expect(container.textContent).not.toContain("server said x");
    answer({ ok: true, personalBests: [pb] });
    const retry = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === copy.retry,
    );
    if (retry === undefined) throw new Error("no retry button");
    fireEvent.click(retry);
    await findByText("time 60 english, 85.4 wpm, 97.2% acc");
  });

  it("reloads after a new personal best", async () => {
    const { findByText } = render(() => <PersonalBests />);
    await findByText(copy.empty);
    expect(session.callWithIdToken).toHaveBeenCalledTimes(1);
    answer({ ok: true, personalBests: [pb] });
    setPersonalBestsVersion((v) => v + 1);
    await findByText("time 60 english, 85.4 wpm, 97.2% acc");
    expect(session.callWithIdToken).toHaveBeenCalledTimes(2);
  });
});
