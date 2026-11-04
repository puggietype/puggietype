import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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
  leaderboardConsentMessage,
  leaderboardMatchesBoard,
  postLeaderboardScore,
  showRaceLeaderboard,
  scoreConsentElapsed,
  scoreFromResult,
  soloAdvanceLabel,
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
      "https://ws.puggietype.com/leaderboards?period=monthly&mode=words&mode2=25&language=english&punctuation=false&numbers=true&limit=50&verified=true",
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
    expect(parseLeaderboardBody(ok)).toEqual({ ...ok, earliestAt: null });
    expect(parseLeaderboardBody({ ok: false, error: "nope" })).toEqual({
      ok: false,
      error: "nope",
    });
  });

  it("treats a missing endsAt as open-ended", () => {
    const { endsAt: _endsAt, ...rest } = ok;
    expect(parseLeaderboardBody(rest)).toMatchObject({ endsAt: null });
  });

  it("keeps earliestAt when the server sends it", () => {
    const earliestAt = Date.UTC(2026, 9, 17, 12);
    expect(parseLeaderboardBody({ ...ok, earliestAt })).toMatchObject({
      earliestAt,
    });
    expect(parseLeaderboardBody({ ...ok, earliestAt: null })).toMatchObject({
      earliestAt: null,
    });
  });

  it("keeps a Solo board off the Multiplayer tab", () => {
    expect(leaderboardMatchesBoard({ verified: false }, true)).toBe(false);
    expect(leaderboardMatchesBoard({ verified: false }, false)).toBe(true);
    expect(leaderboardMatchesBoard({ verified: true }, true)).toBe(true);
    expect(leaderboardMatchesBoard({}, true)).toBe(true);
    expect(leaderboardMatchesBoard({}, false)).toBe(false);
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

  it("sends x-session-token from the existing session and keeps it out of the url", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: false, error: "closed" }), {
        status: 503,
      });
    };
    await fetchLeaderboard(
      "https://ws.puggietype.com",
      defaultLeaderboardQuery({ verified: false }),
      undefined,
      fetchImpl,
      "secret-token",
    );
    expect(seenUrl).toContain("verified=false");
    expect(seenUrl).not.toContain("secret-token");
    expect(seenInit?.headers).toMatchObject({
      "x-session-token": "secret-token",
    });
  });

  it("omits the session header when no token is passed", async () => {
    let seenInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      seenInit = init;
      return new Response(JSON.stringify({ ok: false, error: "closed" }), {
        status: 503,
      });
    };
    await fetchLeaderboard(
      "https://ws.puggietype.com",
      defaultLeaderboardQuery(),
      undefined,
      fetchImpl,
    );
    expect(seenInit?.headers).not.toHaveProperty("x-session-token");
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
        charStats: [400, 20, 5, 2],
        testDuration: 60,
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
      chars: 400,
      durationMs: 60_000,
    });
    expect(
      scoreFromResult({
        mode: "zen",
        mode2: "zen",
        language: "english",
        wpm: 1,
        acc: 100,
        rawWpm: 1,
        charStats: [10, 0, 0, 0],
        testDuration: 30,
      }),
    ).toBeUndefined();
    expect(
      scoreFromResult({
        mode: "time",
        mode2: 15,
        language: "english",
        wpm: 40,
        acc: 90,
        rawWpm: 44,
        charStats: [50, 4, 1, 0],
        testDuration: 15.5,
      }),
    ).toMatchObject({
      chars: 50,
      durationMs: 15_500,
    });
    expect(
      scoreFromResult({
        mode: "time",
        mode2: 15,
        language: "english",
        wpm: 0,
        acc: 0,
        rawWpm: 0,
        charStats: [0, 0, 0, 0],
        testDuration: 15,
      }),
    ).toBeUndefined();
  });

  /**
   * Mirrors puggietype-server parseSoloSubmit (3f5ad2e, soloSubmit.ts):
   * chars is one integer >= 1, the correct-character count passed to
   * computeWpm(chars, durationMs). wpm above 250 is rejected, accuracy is
   * 0–100, and wpm must match that character count and duration.
   */
  function computeWpm(chars: number, durationMs: number): number {
    return chars / 5 / (durationMs / 60_000);
  }

  const soloSubmitSchema = z
    .object({
      showOnLeaderboard: z.boolean(),
      mode: z.enum(["time", "words"]),
      mode2: z.number().int(),
      language: z.string().min(1).max(64),
      punctuation: z.boolean(),
      numbers: z.boolean(),
      wpm: z.number().finite().gte(0).lte(250),
      acc: z.number().finite().gte(0).lte(100),
      raw: z.number().finite().nonnegative(),
      chars: z.number().int().gte(1),
      durationMs: z.number().int().gte(1),
      sessionToken: z.string().min(1).max(128).optional(),
    })
    .strict()
    .superRefine((body, ctx) => {
      const expected = computeWpm(body.chars, body.durationMs);
      if (Math.abs(body.wpm - expected) > 1) {
        ctx.addIssue({
          code: "custom",
          message: "wpm is not consistent with chars and durationMs",
          path: ["wpm"],
        });
      }
    });

  it("builds a payload parseSoloSubmit accepts", () => {
    const score = scoreFromResult({
      mode: "time",
      mode2: 60,
      language: "english",
      punctuation: false,
      numbers: false,
      wpm: 80,
      acc: 97,
      rawWpm: 84,
      charStats: [400, 20, 5, 2],
      testDuration: 60,
    });
    expect(score).toBeDefined();
    if (score === undefined) return;
    const payload = {
      ...score,
      showOnLeaderboard: true,
      sessionToken: "session-secret",
    };
    expect(payload.chars).toBe(400);
    expect(soloSubmitSchema.safeParse(payload).success).toBe(true);
    expect(
      soloSubmitSchema.safeParse({
        ...payload,
        chars: { typed: 430, correct: 400 },
      }).success,
    ).toBe(false);
    expect(soloSubmitSchema.safeParse({ ...payload, chars: 0 }).success).toBe(
      false,
    );
    expect(soloSubmitSchema.safeParse({ ...payload, wpm: 251 }).success).toBe(
      false,
    );
    expect(soloSubmitSchema.safeParse({ ...payload, acc: 101 }).success).toBe(
      false,
    );
    expect(
      soloSubmitSchema.safeParse({ ...payload, durationMs: 0 }).success,
    ).toBe(false);
    expect(soloSubmitSchema.safeParse({ ...payload, wpm: 200 }).success).toBe(
      false,
    );
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
        chars: 175,
        durationMs: 30_000,
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
      chars: 175,
      durationMs: 30_000,
    });
    expect(body).not.toHaveProperty("playerId");
  });
});

describe("score consent and kids finish fields", () => {
  it("requires the toggle to have been visible for 2 seconds", () => {
    expect(scoreConsentElapsed(1_000, 2_999)).toBe(false);
    expect(scoreConsentElapsed(1_000, 3_000)).toBe(true);
  });

  it("marks a kids-guide finish only when this server has leaderboards", () => {
    expect(
      finishLeaderboardFields({
        kids: true,
        leaderboards: true,
      }),
    ).toEqual({ kidsGuide: true });
    expect(
      finishLeaderboardFields({
        kids: true,
        leaderboards: false,
      }),
    ).toEqual({});
    expect(
      finishLeaderboardFields({
        kids: false,
        leaderboards: true,
      }),
    ).toEqual({});
  });
});

describe("leaderboard consent message", () => {
  it("is show:true only, named leaderboard:consent", () => {
    expect(leaderboardConsentMessage("race-1")).toEqual({
      type: "leaderboard:consent",
      raceId: "race-1",
      show: true,
    });
  });

  it("names a button that posts and advances", () => {
    expect(soloAdvanceLabel("next", false)).toBe("Next test");
    expect(soloAdvanceLabel("next", true)).toBe("Submit score & next test");
    expect(soloAdvanceLabel("repeat", true)).toBe("Submit score & repeat");
    expect(soloAdvanceLabel("retry", true)).toBe("Submit score & retry saving");
    expect(soloAdvanceLabel("retry", false)).toBe("Retry saving result");
  });

  it("hides the compact Multiplayer board for a kids-guide session", () => {
    expect(
      showRaceLeaderboard({
        leaderboards: true,
        kids: true,
        inRaceOrResults: true,
      }),
    ).toBe(false);
    expect(
      showRaceLeaderboard({
        leaderboards: true,
        kids: false,
        inRaceOrResults: true,
      }),
    ).toBe(true);
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
