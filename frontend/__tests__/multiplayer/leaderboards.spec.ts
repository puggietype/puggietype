import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultLeaderboardQuery,
  fetchLeaderboard,
  httpBaseFromWsUrl,
  isKidsGuidePath,
  KIDS_FLOW_KEY,
  leaderboardMode2,
  leaderboardSubmitBlocked,
  leaderboardUrl,
  LEADERBOARD_PERIODS,
  parseLeaderboardBody,
  finishLeaderboardFields,
  postLeaderboardScore,
  scoreConsentElapsed,
  scoreFromResult,
} from "../../src/ts/multiplayer/leaderboards";
import {
  loadShowOnLeaderboard,
  setShowOnLeaderboard,
  showOnLeaderboard,
} from "../../src/ts/multiplayer/leaderboard-pref";

const storage = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
};

describe("leaderboard url", () => {
  it("maps the websocket url onto the http origin", () => {
    expect(httpBaseFromWsUrl("wss://ws.puggietype.com/ws")).toBe(
      "https://ws.puggietype.com",
    );
    expect(httpBaseFromWsUrl("ws://localhost:3000/ws")).toBe(
      "http://localhost:3000",
    );
  });

  it("builds the documented query, including monthly", () => {
    expect(LEADERBOARD_PERIODS).toEqual([
      "daily",
      "weekly",
      "monthly",
      "all-time",
    ]);
    const url = leaderboardUrl(
      "https://ws.puggietype.com",
      defaultLeaderboardQuery({
        period: "monthly",
        mode: "words",
        mode2: 25,
        language: "english",
        punctuation: false,
        numbers: true,
        limit: 50,
      }),
    );
    expect(url).toBe(
      "https://ws.puggietype.com/leaderboards?period=monthly&mode=words&mode2=25&language=english&punctuation=false&numbers=true&limit=50",
    );
  });
});

describe("parseLeaderboardBody", () => {
  const ok = {
    ok: true,
    period: "daily",
    periodKey: "2026-11-04",
    startsAt: 1,
    endsAt: 2,
    mode: "time",
    mode2: 30,
    accuracyFloor: 75,
    entries: [{ rank: 1, name: "ZippyPug", wpm: 120, acc: 98.5, raw: 130 }],
  };

  it("accepts a board and an explicit error", () => {
    expect(parseLeaderboardBody(ok)).toEqual(ok);
    expect(parseLeaderboardBody({ ok: false, error: "nope" })).toEqual({
      ok: false,
      error: "nope",
    });
  });

  it("treats a missing endsAt as open-ended", () => {
    const { endsAt: _endsAt, ...rest } = ok;
    expect(parseLeaderboardBody(rest)).toMatchObject({ endsAt: null });
  });

  it("rejects an unexpected shape", () => {
    expect(parseLeaderboardBody({ ok: true })).toEqual({
      ok: false,
      error: "The leaderboard response was not recognized.",
    });
  });
});

describe("fetchLeaderboard", () => {
  it("returns the server error body", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: false, error: "closed" }), {
        status: 503,
      });
    });
    await expect(
      fetchLeaderboard(
        "https://ws.puggietype.com",
        defaultLeaderboardQuery(),
        undefined,
        fetchImpl,
      ),
    ).resolves.toEqual({ ok: false, error: "closed" });
  });

  it("returns a network failure without throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      fetchLeaderboard(
        "https://ws.puggietype.com",
        defaultLeaderboardQuery(),
        undefined,
        fetchImpl,
      ),
    ).resolves.toEqual({ ok: false, error: "Couldn't load the leaderboard." });
  });
});

describe("kids guide", () => {
  it("recognises the kids guide path", () => {
    expect(isKidsGuidePath("/guide/typing-for-kids")).toBe(true);
    expect(isKidsGuidePath("/guide/typing-for-kids/")).toBe(true);
    expect(isKidsGuidePath("/")).toBe(false);
  });

  it("never marks a kids-guide visit as submittable, including later pages", () => {
    const mem = storage();
    expect(leaderboardSubmitBlocked("/guide/typing-for-kids", "", mem)).toBe(
      true,
    );
    expect(
      leaderboardSubmitBlocked(
        "/",
        "https://puggietype.com/guide/typing-for-kids",
        storage(),
      ),
    ).toBe(true);
    expect(leaderboardSubmitBlocked("/", "", mem)).toBe(true);
    expect(mem.getItem(KIDS_FLOW_KEY)).toBe("1");
    expect(leaderboardSubmitBlocked("/race", "", storage())).toBe(false);
  });
});

describe("scores", () => {
  it("only accepts time and words lengths the server races", () => {
    expect(leaderboardMode2("time", "30")).toBe(30);
    expect(leaderboardMode2("words", 10)).toBe(10);
    expect(leaderboardMode2("time", 45)).toBeUndefined();
    expect(leaderboardMode2("zen", 30)).toBeUndefined();
  });

  it("builds a solo score only for an eligible result", () => {
    expect(
      scoreFromResult({
        mode: "time",
        mode2: "60",
        language: "english",
        punctuation: false,
        numbers: false,
        wpm: 80,
        acc: 97,
        rawWpm: 84,
      }),
    ).toEqual({
      mode: "time",
      mode2: 60,
      language: "english",
      punctuation: false,
      numbers: false,
      wpm: 80,
      acc: 97,
      raw: 84,
    });
    expect(
      scoreFromResult({
        mode: "zen",
        mode2: "zen",
        language: "english",
        wpm: 1,
        acc: 100,
        rawWpm: 1,
      }),
    ).toBeUndefined();
  });

  it("posts showOnLeaderboard with the score", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      seen = { url, init };
      return new Response("{}", { status: 200 });
    };
    await postLeaderboardScore(
      "https://ws.puggietype.com",
      {
        showOnLeaderboard: false,
        mode: "time",
        mode2: 30,
        language: "english",
        punctuation: false,
        numbers: false,
        wpm: 70,
        acc: 99,
        raw: 72,
        sessionToken: "t",
      },
      fetchImpl,
    );
    expect(seen?.url).toBe("https://ws.puggietype.com/leaderboards");
    expect(seen?.init?.method).toBe("POST");
    const raw = seen?.init?.body;
    if (typeof raw !== "string") throw new Error("expected a string body");
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(body).toMatchObject({
      showOnLeaderboard: false,
      sessionToken: "t",
      wpm: 70,
    });
    expect(body).not.toHaveProperty("playerId");
  });
});

describe("score consent and kids finish fields", () => {
  it("requires the toggle to have been visible for 2 seconds", () => {
    expect(scoreConsentElapsed(1_000, 2_999)).toBe(false);
    expect(scoreConsentElapsed(1_000, 3_000)).toBe(true);
  });

  it("marks a kids-guide finish and otherwise omits the flag", () => {
    expect(
      finishLeaderboardFields({
        show: true,
        kids: true,
        leaderboards: true,
      }),
    ).toEqual({ kidsGuide: true, showOnLeaderboard: false });
    expect(
      finishLeaderboardFields({
        show: true,
        kids: true,
        leaderboards: false,
      }),
    ).toEqual({});
    expect(
      finishLeaderboardFields({
        show: true,
        kids: false,
        leaderboards: false,
      }),
    ).toEqual({});
    expect(
      finishLeaderboardFields({
        show: false,
        kids: false,
        leaderboards: true,
      }),
    ).toEqual({ showOnLeaderboard: false });
  });
});

describe("show on leaderboard preference", () => {
  afterEach(() => {
    localStorage.removeItem("puggie-lb-show");
    setShowOnLeaderboard(true);
  });

  it("defaults to on and persists", () => {
    const mem = storage();
    expect(loadShowOnLeaderboard(mem)).toBe(true);
    setShowOnLeaderboard(false, mem);
    expect(mem.getItem("puggie-lb-show")).toBe("false");
    expect(showOnLeaderboard()).toBe(false);
    expect(loadShowOnLeaderboard(mem)).toBe(false);
  });
});
