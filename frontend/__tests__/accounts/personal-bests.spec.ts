import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ submitPersonalBest: vi.fn() }));
vi.mock("../../src/ts/accounts/api", () => api);

const session = vi.hoisted(() => ({ callWithIdToken: vi.fn() }));
vi.mock("../../src/ts/accounts/authed-call", () => session);

import {
  submitIfPersonalBest,
  toPersonalBest,
} from "../../src/ts/accounts/personal-bests";
import {
  getPersonalBestsVersion,
  setAccountUser,
} from "../../src/ts/accounts/state";
import { CompletedResult } from "../../src/ts/states/test";

const user = {
  uid: "u1",
  displayName: "Sleepy Pug 42",
  emailVerified: false,
  ageOk: true,
  lbListed: false,
  verifiedTypist: false,
  status: "active",
  createdAt: "2026-11-04T00:00:00.000Z",
};

function result(change: Partial<CompletedResult> = {}): CompletedResult {
  return {
    wpm: 85.43,
    rawWpm: 90.1,
    charStats: [400, 3, 0, 0],
    charTotal: 403,
    acc: 97.24,
    mode: "time",
    mode2: "60",
    timestamp: 1,
    testDuration: 60,
    consistency: 78.5,
    keyConsistency: 60,
    wpmConsistency: 80,
    chartData: { wpm: [], burst: [], err: [] },
    restartCount: 0,
    incompleteTestSeconds: 0,
    incompleteTests: [],
    afkDuration: 0,
    tags: [],
    bailedOut: false,
    blindMode: false,
    lazyMode: false,
    funbox: [],
    language: "english",
    difficulty: "normal",
    numbers: false,
    punctuation: true,
    keyDuration: [],
    keySpacing: [],
    keyOverlap: 0,
    lastKeyToEnd: 0,
    startToFirstKey: 0,
    stopOnLetter: false,
    ...change,
  };
}

const expected = {
  mode: "time",
  mode2: "60",
  language: "english",
  punctuation: true,
  numbers: false,
  wpm: 85.43,
  rawWpm: 90.1,
  acc: 97.24,
  consistency: 78.5,
  durationS: 60,
};

describe("toPersonalBest", () => {
  it("maps an eligible time result", () => {
    expect(toPersonalBest(result())).toEqual({
      ok: true,
      personalBest: expected,
    });
  });

  it("words mode: mode2 as a string, duration in seconds", () => {
    const mapped = toPersonalBest(
      result({ mode: "words", mode2: "50", testDuration: 31.27 }),
    );
    expect(mapped).toMatchObject({
      ok: true,
      personalBest: { mode: "words", mode2: "50", durationS: 31.27 },
    });
  });

  it("a non-finite consistency goes as null", () => {
    expect(toPersonalBest(result({ consistency: NaN }))).toMatchObject({
      ok: true,
      personalBest: { consistency: null },
    });
  });

  it.each<[string, Partial<CompletedResult>]>([
    ["quote", { mode: "quote", mode2: "1" }],
    ["zen", { mode: "zen", mode2: "zen" }],
    ["custom", { mode: "custom", mode2: "custom" }],
    ["funbox (no PB)", { funbox: ["nospace"] }],
    ["funbox (PB-able)", { funbox: ["mirror"] }],
    ["difficulty expert", { difficulty: "expert" }],
    ["difficulty master", { difficulty: "master" }],
    ["lazy mode", { lazyMode: true }],
    ["bailed out", { bailedOut: true }],
    ["stop on letter under 100%", { stopOnLetter: true }],
    ["wpm 0", { wpm: 0 }],
    ["wpm over 350", { wpm: 351, rawWpm: 360 }],
    ["raw under wpm", { rawWpm: 80 }],
    ["raw over 400", { wpm: 300, rawWpm: 401 }],
    ["acc over 100", { acc: 100.5 }],
    ["acc negative", { acc: -1 }],
    ["duration 0", { testDuration: 0 }],
    ["duration over an hour", { testDuration: 3601 }],
    ["wpm NaN", { wpm: NaN }],
  ])("not sent: %s", (_label, change) => {
    expect(toPersonalBest(result(change)).ok).toBe(false);
  });

  it("stop on letter at 100% still counts", () => {
    expect(toPersonalBest(result({ stopOnLetter: true, acc: 100 })).ok).toBe(
      true,
    );
  });

  it("boundaries the server accepts are sent", () => {
    const edge = result({ wpm: 350, rawWpm: 400, acc: 0, testDuration: 3600 });
    expect(toPersonalBest(edge).ok).toBe(true);
  });
});

describe("submitIfPersonalBest", () => {
  beforeEach(() => {
    setAccountUser(user);
    session.callWithIdToken.mockImplementation(
      async (run: (o: object) => Promise<unknown>) =>
        run({ apiUrl: "https://api.example.test", idToken: "id-token" }),
    );
    api.submitPersonalBest.mockResolvedValue({
      ok: true,
      personalBest: {},
      isNew: false,
    });
  });

  afterEach(() => {
    setAccountUser(null);
    vi.clearAllMocks();
  });

  it("sends exactly the mapped body with the token options", async () => {
    await submitIfPersonalBest(result());
    expect(api.submitPersonalBest).toHaveBeenCalledWith({
      apiUrl: "https://api.example.test",
      idToken: "id-token",
      personalBest: expected,
    });
  });

  it("signed out or ineligible: no request", async () => {
    await submitIfPersonalBest(result({ funbox: ["mirror"] }));
    setAccountUser(null);
    await submitIfPersonalBest(result());
    expect(session.callWithIdToken).not.toHaveBeenCalled();
  });

  it("a new PB refreshes the list; a non-PB doesn't", async () => {
    const before = getPersonalBestsVersion();
    await submitIfPersonalBest(result());
    expect(getPersonalBestsVersion()).toBe(before);
    api.submitPersonalBest.mockResolvedValue({
      ok: true,
      personalBest: {},
      isNew: true,
    });
    await submitIfPersonalBest(result());
    expect(getPersonalBestsVersion()).toBe(before + 1);
  });

  it("at most one request in flight; later results are dropped", async () => {
    let finish: (v: unknown) => void = () => undefined;
    api.submitPersonalBest.mockReturnValueOnce(
      new Promise((r) => (finish = r)),
    );
    const first = submitIfPersonalBest(result());
    await submitIfPersonalBest(result());
    await submitIfPersonalBest(result());
    expect(api.submitPersonalBest).toHaveBeenCalledTimes(1);
    finish({ ok: false, status: 503, code: "", message: "x" });
    await first;
    // a failure is never retried
    expect(api.submitPersonalBest).toHaveBeenCalledTimes(1);
    await submitIfPersonalBest(result());
    expect(api.submitPersonalBest).toHaveBeenCalledTimes(2);
  });

  it("never throws", async () => {
    session.callWithIdToken.mockRejectedValueOnce(new Error("boom"));
    await expect(submitIfPersonalBest(result())).resolves.toBeUndefined();
    api.submitPersonalBest.mockResolvedValueOnce({
      ok: false,
      status: 409,
      code: "pb_limit",
      message: "x",
    });
    await expect(submitIfPersonalBest(result())).resolves.toBeUndefined();
    // a broken result object either
    await expect(
      submitIfPersonalBest(null as unknown as CompletedResult),
    ).resolves.toBeUndefined();
  });
});
