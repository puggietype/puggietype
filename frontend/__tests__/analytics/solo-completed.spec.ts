import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONSENT_STORAGE_KEY,
  KIDS_FLOW_STORAGE_KEY,
} from "../../src/ts/analytics/consent";
import {
  sendSoloCompleted,
  type SoloCompletedInput,
  soloCompletedBody,
  soloCounterConsentAllows,
} from "../../src/ts/analytics/solo-completed";
import {
  KIDS_GUIDE_PATH,
  TEACHING_KIDS_GUIDE_PATH,
} from "../../src/ts/controllers/background-music";
import { isGhostApplicable } from "../../src/ts/test/ghost-race";
import { leaderboardHttpBase } from "../../src/ts/multiplayer/leaderboards";

const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

const base: SoloCompletedInput = {
  mode: "time",
  mode2: "30",
  valid: true,
  bailedOut: false,
  ghostApplicable: false,
};

function setConsent(analytics: boolean | null): void {
  if (analytics === null) {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    return;
  }
  localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({ security: true, analytics, doNotSellOrShare: false }),
  );
}

function onlyCall(): { url: string; init: RequestInit } {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  return { url, init };
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("soloCompletedBody allowlist", () => {
  it("maps time and words lengths", () => {
    expect(soloCompletedBody({ mode: "time", mode2: "30" })).toEqual({
      mode: "time",
      length: "30",
    });
    for (const len of ["15", "60", "120"]) {
      expect(soloCompletedBody({ mode: "time", mode2: len }).length).toBe(len);
    }
    expect(soloCompletedBody({ mode: "words", mode2: "50" })).toEqual({
      mode: "words",
      length: "50",
    });
    for (const len of ["10", "25", "100"]) {
      expect(soloCompletedBody({ mode: "words", mode2: len }).length).toBe(len);
    }
  });

  it("maps unknown or cross-mode lengths to other", () => {
    expect(soloCompletedBody({ mode: "time", mode2: "45" }).length).toBe(
      "other",
    );
    expect(soloCompletedBody({ mode: "time", mode2: "50" }).length).toBe(
      "other",
    );
    expect(soloCompletedBody({ mode: "words", mode2: "30" }).length).toBe(
      "other",
    );
    expect(soloCompletedBody({ mode: "words", mode2: "0" }).length).toBe(
      "other",
    );
    expect(soloCompletedBody({ mode: "time", mode2: " 30" }).length).toBe(
      "other",
    );
  });

  it("maps quote groups 0-3 to short/medium/long/thicc", () => {
    const groups = ["short", "medium", "long", "thicc"];
    groups.forEach((length, quoteGroup) => {
      expect(
        soloCompletedBody({ mode: "quote", mode2: "1234", quoteGroup }),
      ).toEqual({ mode: "quote", length });
    });
    expect(
      soloCompletedBody({ mode: "quote", mode2: "1", quoteGroup: 1 }),
    ).toEqual({ mode: "quote", length: "medium" });
    for (const quoteGroup of [undefined, -1, 4, 1.5, NaN]) {
      expect(
        soloCompletedBody({ mode: "quote", mode2: "1", quoteGroup }).length,
      ).toBe("other");
    }
  });

  it("zen and custom send length custom, never the text", () => {
    expect(soloCompletedBody({ mode: "zen", mode2: "zen" })).toEqual({
      mode: "zen",
      length: "custom",
    });
    expect(
      soloCompletedBody({ mode: "custom", mode2: "my secret text" }),
    ).toEqual({ mode: "custom", length: "custom" });
  });

  it("unknown mode is other with length other", () => {
    expect(soloCompletedBody({ mode: "hacked", mode2: "30" })).toEqual({
      mode: "other",
      length: "other",
    });
  });
});

describe("consent rule", () => {
  it("accepted and undecided allow, reject never does", () => {
    expect(soloCounterConsentAllows(true)).toBe(true);
    expect(soloCounterConsentAllows(null)).toBe(true);
    expect(soloCounterConsentAllows(false)).toBe(false);
  });
});

describe("sendSoloCompleted", () => {
  for (const [label, analytics] of [
    ["accepted", true],
    ["no choice yet", null],
  ] as const) {
    it(`${label}: one POST, body exactly {mode, length}, no credentials, referrer or extra headers`, () => {
      setConsent(analytics);
      sendSoloCompleted(base);
      const { url, init } = onlyCall();
      expect(new URL(url).pathname).toBe("/solo-completed");
      expect(new URL(url).search).toBe("");
      expect(init.method).toBe("POST");
      expect(init.credentials).toBe("omit");
      expect(init.referrerPolicy).toBe("no-referrer");
      expect(JSON.parse(init.body as string)).toStrictEqual({
        mode: "time",
        length: "30",
      });
      expect(Object.keys(JSON.parse(init.body as string))).toEqual([
        "mode",
        "length",
      ]);
      expect(init.headers).toBeUndefined();
      expect(Object.keys(init).sort()).toEqual([
        "body",
        "credentials",
        "keepalive",
        "method",
        "referrerPolicy",
      ]);
    });
  }

  it("unparseable consent record counts as no choice", () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, "{not json");
    sendSoloCompleted(base);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("after reject: 0 requests", () => {
    setConsent(false);
    sendSoloCompleted(base);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("in-session withdrawal: sends before, 0 after", () => {
    setConsent(true);
    sendSoloCompleted(base);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    setConsent(false);
    sendSoloCompleted(base);
    sendSoloCompleted(base);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("kids guide paths: 0 requests, even when accepted", () => {
    setConsent(true);
    for (const p of [
      KIDS_GUIDE_PATH,
      `${KIDS_GUIDE_PATH}/`,
      TEACHING_KIDS_GUIDE_PATH,
    ]) {
      window.history.replaceState(null, "", p);
      sendSoloCompleted(base);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sticky kids-flow tab: 0 requests on / even when accepted", () => {
    setConsent(true);
    sessionStorage.setItem(KIDS_FLOW_STORAGE_KEY, "1");
    sendSoloCompleted(base);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a kids-guide visit marks the tab, later solo tests on / send nothing", () => {
    setConsent(null);
    window.history.replaceState(null, "", KIDS_GUIDE_PATH);
    sendSoloCompleted(base);
    window.history.replaceState(null, "", "/");
    sendSoloCompleted(base);
    expect(sessionStorage.getItem(KIDS_FLOW_STORAGE_KEY)).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("invalid or bailed-out tests: 0 requests", () => {
    setConsent(true);
    sendSoloCompleted({ ...base, valid: false });
    sendSoloCompleted({ ...base, bailedOut: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ghost race: 0 requests; ordinary time test with the toggle off: 1", () => {
    setConsent(true);
    const gate = {
      flagEnabled: true,
      toggleEnabled: true,
      raceActive: false,
      mode: "time",
      funboxCount: 0,
    };
    sendSoloCompleted({ ...base, ghostApplicable: isGhostApplicable(gate) });
    sendSoloCompleted({
      ...base,
      mode: "words",
      mode2: "25",
      ghostApplicable: isGhostApplicable({ ...gate, mode: "words" }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    sendSoloCompleted({
      ...base,
      ghostApplicable: isGhostApplicable({ ...gate, toggleEnabled: false }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("steam build: 0 requests", () => {
    setConsent(true);
    vi.stubGlobal("__PLATFORM__", "steam");
    sendSoloCompleted(base);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a rejected fetch is not retried and does not throw", async () => {
    setConsent(true);
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("network down");
    });
    expect(() => sendSoloCompleted(base)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a synchronously throwing fetch does not throw", () => {
    setConsent(true);
    fetchMock.mockImplementationOnce(() => {
      throw new TypeError("blocked");
    });
    expect(() => sendSoloCompleted(base)).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("production origin is https://ws.puggietype.com", () => {
    expect(
      leaderboardHttpBase({
        protocol: "https:",
        host: "puggietype.com",
        hostname: "puggietype.com",
      }),
    ).toBe("https://ws.puggietype.com");
  });
});

describe("finish() call site", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../../src/ts/test/test-logic.ts"),
    "utf8",
  );
  const start = src.indexOf("export async function finish(");
  const end = src.indexOf("\n}\n", start);
  const finish = src.slice(start, end);

  it("sends once, after the race early return and the fail checks", () => {
    expect(src.split("sendSoloCompleted(").length - 1).toBe(1);
    const race = finish.indexOf("if (raceTookResult) {");
    const raceReturn = finish.indexOf("return;", race);
    const snapshot = finish.indexOf("const soloCountable = !dontSave;");
    const failChecks = finish.indexOf("// test is valid");
    const loggedOut = finish.indexOf("// logged out");
    const send = finish.indexOf("sendSoloCompleted(");
    expect(race).toBeGreaterThan(-1);
    expect(raceReturn).toBeGreaterThan(race);
    expect(failChecks).toBeGreaterThan(raceReturn);
    expect(snapshot).toBeGreaterThan(failChecks);
    expect(loggedOut).toBeGreaterThan(snapshot);
    expect(send).toBeGreaterThan(loggedOut);
    const call = finish.slice(send, finish.indexOf("});", send));
    expect(call).toContain("valid: soloCountable");
    expect(call).toContain("bailedOut: completedEvent.bailedOut");
    expect(call).toContain("GhostCaret.isGhostRaceApplicable()");
    expect(finish.slice(send - 40, send)).not.toContain("await");
  });

  it("restart() has no counter hook", () => {
    const r = src.indexOf("export async function restart(");
    const rEnd = src.indexOf("\n}\n", r);
    expect(r).toBeGreaterThan(-1);
    expect(src.slice(r, rEnd)).not.toContain("SoloCompleted");
  });
});
