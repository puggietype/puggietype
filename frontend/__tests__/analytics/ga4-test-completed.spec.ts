import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  ga4MeasurementId: "",
}));

vi.mock("virtual:env-config", () => ({
  envConfig: env,
}));

import {
  shouldReportTestCompleted,
  testCompletedParams,
  testLengthParam,
  wpmBucket,
  type TestCompletedInput,
} from "../../src/ts/analytics/test-completed";
import {
  KIDS_FLOW_STORAGE_KEY,
  writeConsentRecord,
} from "../../src/ts/analytics/consent";

const id = "G-DONE1234";

const ACCEPTED = {
  security: true,
  analytics: true,
  doNotSellOrShare: false,
} as const;

const REJECTED = {
  security: true,
  analytics: false,
  doNotSellOrShare: true,
} as const;

type Page = Window & { dataLayer?: unknown[]; gtag?: unknown };

function page(): Page {
  return window;
}

const TIME_30: TestCompletedInput = {
  mode: "time",
  mode2: "30",
  wpm: 72.4,
  language: "english",
};

type GaModules = typeof import("../../src/ts/analytics/ga4") &
  typeof import("../../src/ts/analytics/test-completed");

async function freshGa(): Promise<GaModules> {
  page().dataLayer = [];
  Reflect.deleteProperty(page(), "gtag");
  vi.resetModules();
  const ga = await import("../../src/ts/analytics/ga4");
  const ev = await import("../../src/ts/analytics/test-completed");
  return { ...ga, ...ev };
}

async function loadedGa(): Promise<GaModules> {
  const ga = await freshGa();
  ga.syncGa4();
  return ga;
}

function completions(): Record<string, unknown>[] {
  return (page().dataLayer ?? [])
    .map((entry) => [...(entry as IArguments)] as unknown[])
    .filter((args) => args[0] === "event" && args[1] === "test_completed")
    .map((args) => args[2] as Record<string, unknown>);
}

describe("test_completed params", () => {
  it.each([
    [0, "0-19"],
    [19, "0-19"],
    [19.99, "0-19"],
    [20, "20-39"],
    [39, "20-39"],
    [40, "40-59"],
    [139, "120-139"],
    [139.9, "120-139"],
    [140, "140+"],
    [141, "140+"],
    [400, "140+"],
  ])("buckets %s wpm as %s", (wpm, bucket) => {
    expect(wpmBucket(wpm)).toBe(bucket);
  });

  it.each([NaN, Infinity, -Infinity, -1])("drops wpm %s", (wpm) => {
    expect(wpmBucket(wpm)).toBeNull();
    expect(testCompletedParams({ ...TIME_30, wpm })).toBeNull();
  });

  it.each([
    [0, "short"],
    [1, "medium"],
    [2, "long"],
    [3, "thicc"],
    [-1, "custom"],
    [-2, "custom"],
    [-3, "custom"],
    [4, "custom"],
    [1.5, "custom"],
    [undefined, "custom"],
  ])("maps quote group %s to %s", (group, name) => {
    expect(testLengthParam("quote", "123", group)).toBe(name);
  });

  it.each([
    ["time", "15", "15"],
    ["time", "120", "120"],
    ["time", "99999", "99999"],
    ["time", "0", "custom"],
    ["time", "100000", "custom"],
    ["time", "030", "custom"],
    ["time", "30.5", "custom"],
    ["time", "custom", "custom"],
    ["words", "10", "10"],
    ["words", "100", "100"],
    ["words", "-5", "custom"],
    ["words", "a@b.c", "custom"],
    ["zen", "zen", "custom"],
    ["custom", "custom", "custom"],
  ] as const)("%s mode2 %s length is %s", (mode, mode2, length) => {
    expect(testLengthParam(mode, mode2, undefined)).toBe(length);
  });

  it("builds exact params for time, words, quote, zen, custom", () => {
    expect(testCompletedParams(TIME_30)).toStrictEqual({
      test_mode: "time",
      test_length: "30",
      wpm_bucket: "60-79",
      language: "english",
    });
    expect(
      testCompletedParams({
        mode: "words",
        mode2: "50",
        wpm: 45,
        language: "english_1k",
      }),
    ).toStrictEqual({
      test_mode: "words",
      test_length: "50",
      wpm_bucket: "40-59",
      language: "english_1k",
    });
    expect(
      testCompletedParams({
        mode: "quote",
        mode2: "4021",
        quoteLength: 1,
        wpm: 101,
        language: "english",
      }),
    ).toStrictEqual({
      test_mode: "quote",
      test_length: "medium",
      wpm_bucket: "100-119",
      language: "english",
    });
    for (const mode of ["zen", "custom"]) {
      expect(
        testCompletedParams({
          mode,
          mode2: mode,
          wpm: 10,
          language: "english",
        }),
      ).toStrictEqual({
        test_mode: mode,
        test_length: "custom",
        wpm_bucket: "0-19",
        language: "english",
      });
    }
  });

  it("omits a language that is not in LanguageSchema", () => {
    for (const language of [
      "not_a_language",
      "ada@example.com",
      "",
      undefined,
      "English",
    ]) {
      const params = testCompletedParams({ ...TIME_30, language });
      expect(params).not.toBeNull();
      expect(params).not.toHaveProperty("language");
    }
  });

  it("drops unknown modes", () => {
    expect(testCompletedParams({ ...TIME_30, mode: "race" })).toBeNull();
    expect(testCompletedParams({ ...TIME_30, mode: "" })).toBeNull();
  });

  it("reports only valid, non bailed out results", () => {
    expect(shouldReportTestCompleted({}, true)).toBe(true);
    expect(shouldReportTestCompleted({ bailedOut: false }, true)).toBe(true);
    expect(shouldReportTestCompleted({ bailedOut: true }, true)).toBe(false);
    expect(shouldReportTestCompleted({}, false)).toBe(false);
  });
});

describe("sendTestCompleted consent gate", () => {
  beforeEach(() => {
    env.ga4MeasurementId = id;
    window.history.pushState({}, "", "/");
    sessionStorage.removeItem(KIDS_FLOW_STORAGE_KEY);
    writeConsentRecord(ACCEPTED);
    Reflect.set(window, `ga-disable-${id}`, false);
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => node);
  });

  afterEach(() => {
    env.ga4MeasurementId = "";
    Reflect.set(window, `ga-disable-${id}`, false);
    sessionStorage.removeItem(KIDS_FLOW_STORAGE_KEY);
    localStorage.clear();
    window.history.pushState({}, "", "/");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fires once per completed solo test with exact name and params", async () => {
    const ga = await loadedGa();
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toStrictEqual([
      {
        test_mode: "time",
        test_length: "30",
        wpm_bucket: "60-79",
        language: "english",
        send_to: id,
      },
    ]);
    ga.sendTestCompleted({ ...TIME_30, mode: "words", mode2: "50" }, true);
    expect(completions()).toHaveLength(2);
  });

  it("sends no result fields beyond the schema", async () => {
    const ga = await loadedGa();
    const full = {
      ...TIME_30,
      wpm: 88.88,
      acc: 97.5,
      rawWpm: 91,
      uid: "user-123",
      name: "ada",
      timestamp: 1_700_000_000_000,
      customText: { text: ["secret", "words"] },
    };
    ga.sendTestCompleted(full, true);
    const [params] = completions();
    expect(Object.keys(params ?? {}).sort()).toStrictEqual([
      "language",
      "send_to",
      "test_length",
      "test_mode",
      "wpm_bucket",
    ]);
    expect(JSON.stringify(params)).not.toMatch(
      /88\.88|97\.5|user-123|ada|secret/,
    );
  });

  it("fires for a valid logged-out completion", async () => {
    // finish() passes the fail-check validity, not the late guest dontSave
    const ga = await loadedGa();
    ga.sendTestCompleted({ ...TIME_30, bailedOut: false }, true);
    expect(completions()).toHaveLength(1);
  });

  it("does not fire for invalid, failed, too short, AFK, repeated", async () => {
    const ga = await loadedGa();
    ga.sendTestCompleted(TIME_30, false);
    expect(completions()).toHaveLength(0);
  });

  it("does not fire for a bailed out test, even if otherwise valid", async () => {
    const ga = await loadedGa();
    ga.sendTestCompleted({ ...TIME_30, bailedOut: true }, true);
    expect(completions()).toHaveLength(0);
  });

  it("does not fire with no consent choice", async () => {
    localStorage.clear();
    const ga = await loadedGa();
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toHaveLength(0);
  });

  it("does not fire after reject", async () => {
    writeConsentRecord(REJECTED);
    const ga = await loadedGa();
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toHaveLength(0);
  });

  it("does not fire after an in-session withdrawal", async () => {
    const ga = await loadedGa();
    writeConsentRecord(REJECTED);
    expect(Reflect.get(window, ga.gaDisableKey(id))).toBe(true);
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toHaveLength(0);
  });

  it("does not fire while the ga-disable flag is set", async () => {
    const ga = await loadedGa();
    Reflect.set(window, ga.gaDisableKey(id), true);
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toHaveLength(0);
  });

  it("does not fire before GA4 is loaded or when gtag is missing", async () => {
    const ga = await freshGa();
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toHaveLength(0);
    ga.syncGa4();
    Reflect.deleteProperty(page(), "gtag");
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toHaveLength(0);
  });

  it("does not fire without a valid measurement id", async () => {
    const ga = await loadedGa();
    env.ga4MeasurementId = "";
    ga.sendTestCompleted(TIME_30, true);
    env.ga4MeasurementId = "UA-123";
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toHaveLength(0);
  });

  it("does not fire on kids paths or in a kids-flow session, even after accept", async () => {
    const ga = await loadedGa();
    window.history.pushState({}, "", "/guide/typing-for-kids");
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toHaveLength(0);
    // sticky: back on the main test in the same tab
    window.history.pushState({}, "", "/");
    expect(sessionStorage.getItem(KIDS_FLOW_STORAGE_KEY)).toBe("1");
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toHaveLength(0);
  });

  it("does not fire when the kids-flow flag is already set", async () => {
    const ga = await loadedGa();
    sessionStorage.setItem(KIDS_FLOW_STORAGE_KEY, "1");
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toHaveLength(0);
  });

  it("does not fire on Steam", async () => {
    const ga = await loadedGa();
    vi.stubGlobal("__PLATFORM__", "steam");
    ga.sendTestCompleted(TIME_30, true);
    expect(completions()).toHaveLength(0);
  });

  it("does not fire for unknown modes or non-finite wpm", async () => {
    const ga = await loadedGa();
    ga.sendTestCompleted({ ...TIME_30, mode: "race" }, true);
    ga.sendTestCompleted({ ...TIME_30, wpm: NaN }, true);
    expect(completions()).toHaveLength(0);
  });

  it("never throws into finish", async () => {
    const ga = await loadedGa();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => ga.sendTestCompleted(TIME_30, true)).not.toThrow();
  });
});

describe("finish() call site", () => {
  const source = readFileSync(
    path.resolve(__dirname, "../../src/ts/test/test-logic.ts"),
    "utf8",
  );
  const start = source.indexOf("export async function finish");
  const body = source.slice(start, source.indexOf("\n}\n", start));
  const fire = body.indexOf("sendTestCompleted(completedEvent, validResult)");

  it("fires once, after the race early return and fail checks", () => {
    expect(fire).toBeGreaterThan(-1);
    expect(body.split("sendTestCompleted(").length - 1).toBe(1);
    expect(fire).toBeGreaterThan(body.indexOf("if (raceTookResult)"));
    expect(fire).toBeGreaterThan(body.indexOf('"Test invalid - accuracy"'));
    expect(fire).toBeLessThan(body.indexOf("showResult(completedEvent"));
  });

  it("snapshots validity before the guest dontSave override", () => {
    const snapshot = body.indexOf("const validResult = !dontSave;");
    const guest = body.indexOf("// logged out");
    expect(snapshot).toBeGreaterThan(body.indexOf('"Test invalid - accuracy"'));
    expect(snapshot).toBeLessThan(guest);
    expect(body.slice(snapshot, guest)).not.toMatch(/dontSave = /);
  });

  it("is not called from restart", () => {
    const restart = source.indexOf("export async function restart");
    expect(restart).toBeGreaterThan(-1);
    const restartBody = source.slice(restart, source.indexOf("\n}\n", restart));
    expect(restartBody).not.toContain("sendTestCompleted");
  });
});
