import { describe, expect, it, vi } from "vitest";

import {
  apiErrorMessage,
  apiUrlFor,
  createSession,
  deleteMe,
  exportMyData,
  getMe,
  getPersonalBests,
  getSettings,
  putSettings,
  submitPersonalBest,
} from "../../src/ts/accounts/api";
import { accountsCopy } from "../../src/ts/accounts/strings";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const user = {
  uid: "u1",
  displayName: "Sleepy Pug 42",
  emailVerified: true,
  ageOk: true,
  lbListed: false,
  verifiedTypist: false,
  status: "active",
  createdAt: "2026-11-04T00:00:00.000Z",
};

const base = {
  apiUrl: "https://api.example.test",
  idToken: "id-token",
  turnstileToken: "ts-token",
};

function fetchReturning(
  response: () => Response,
): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async () => response());
}

describe("accounts api client", () => {
  it("builds urls without double slashes", () => {
    expect(apiUrlFor("https://api.example.test", "/v1/me")).toBe(
      "https://api.example.test/v1/me",
    );
    expect(apiUrlFor("https://example.test/api//", "/v1/auth/session")).toBe(
      "https://example.test/api/v1/auth/session",
    );
  });

  describe("POST /v1/auth/session", () => {
    it("sends the bearer and turnstile tokens, no cookies, no ageOk", async () => {
      const fetchFn = fetchReturning(() => jsonResponse(200, { user }));
      const result = await createSession({ ...base, fetchFn });
      expect(result).toEqual({ ok: true, user, created: false });
      const [url, init] = fetchFn.mock.calls[0] ?? [];
      expect(url).toBe("https://api.example.test/v1/auth/session");
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("omit");
      expect(init?.cache).toBe("no-store");
      expect(init?.headers).toEqual({
        Authorization: "Bearer id-token",
        "Content-Type": "application/json",
      });
      expect(JSON.parse(init?.body as string)).toEqual({
        turnstileToken: "ts-token",
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it("sends ageOk: true only when given, never a birth year", async () => {
      const fetchFn = fetchReturning(() => jsonResponse(201, { user }));
      const result = await createSession({ ...base, ageOk: true, fetchFn });
      expect(result).toEqual({ ok: true, user, created: true });
      const body = JSON.parse(fetchFn.mock.calls[0]?.[1]?.body as string);
      expect(body).toEqual({ turnstileToken: "ts-token", ageOk: true });
    });

    it("keeps suspension fields and ignores unknown ones", async () => {
      const suspended = {
        ...user,
        status: "suspended",
        statusReason: "r",
        statusNoticeRef: "n1",
      };
      const fetchFn = fetchReturning(() =>
        jsonResponse(200, { user: { ...suspended, extra: 1 } }),
      );
      expect(await createSession({ ...base, fetchFn })).toEqual({
        ok: true,
        user: suspended,
        created: false,
      });
    });

    it.each([
      [403, "turnstile_failed", accountsCopy.api.turnstileFailed],
      [503, "turnstile_unavailable", accountsCopy.api.turnstileUnavailable],
      [401, "unauthorized", accountsCopy.api.unauthorized],
      [403, "age_check_required", accountsCopy.api.ageCheckRequired],
      [503, "accounts_disabled", accountsCopy.api.unavailable],
      [429, "", accountsCopy.api.rateLimited],
      [413, "", accountsCopy.api.failed(413)],
    ])(
      "maps %i %s to fixed copy and keeps the code",
      async (status, code, msg) => {
        const fetchFn = fetchReturning(() =>
          jsonResponse(status, code === "" ? {} : { error: code }),
        );
        expect(await createSession({ ...base, fetchFn })).toEqual({
          ok: false,
          status,
          code,
          message: msg,
        });
      },
    );

    it("never shows or keeps server text", async () => {
      const fetchFn = fetchReturning(() =>
        jsonResponse(403, { error: "<b>server text</b>", message: "x" }),
      );
      const result = await createSession({ ...base, fetchFn });
      expect(result).toEqual({
        ok: false,
        status: 403,
        code: "",
        message: accountsCopy.api.failed(403),
      });
    });

    it("tolerates a non-JSON error body", async () => {
      const fetchFn = fetchReturning(
        () => new Response("<html>", { status: 502 }),
      );
      const result = await createSession({ ...base, fetchFn });
      expect(result).toMatchObject({ ok: false, status: 502, code: "" });
    });

    it.each([
      ["not json", () => new Response("nope", { status: 200 })],
      ["bare user (no wrapper)", () => jsonResponse(200, user)],
      ["missing uid", () => jsonResponse(200, { user: { ...user, uid: "" } })],
      [
        "wrong type",
        () => jsonResponse(200, { user: { ...user, emailVerified: "yes" } }),
      ],
    ])("rejects a malformed success (%s)", async (_label, response) => {
      const fetchFn = fetchReturning(response);
      const result = await createSession({ ...base, fetchFn });
      expect(result).toMatchObject({
        ok: false,
        message: accountsCopy.api.badResponse,
      });
    });

    it("reports network errors and timeouts as status 0", async () => {
      const fetchFn = vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      });
      expect(await createSession({ ...base, fetchFn })).toEqual({
        ok: false,
        status: 0,
        code: "",
        message: accountsCopy.api.network,
      });

      const hanging = vi.fn<typeof fetch>(
        async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("timeout", "TimeoutError")),
            );
          }),
      );
      const result = await createSession({
        ...base,
        fetchFn: hanging,
        timeoutMs: 10,
      });
      expect(result).toMatchObject({ ok: false, status: 0 });
    });

    it("does not call fetch when no api url is configured", async () => {
      const fetchFn = vi.fn<typeof fetch>();
      const result = await createSession({ ...base, apiUrl: "", fetchFn });
      expect(result.ok).toBe(false);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe("GET /v1/me", () => {
    it("returns the user, no body, no content-type", async () => {
      const fetchFn = fetchReturning(() => jsonResponse(200, { user }));
      expect(await getMe({ ...base, fetchFn })).toEqual({ ok: true, user });
      const [url, init] = fetchFn.mock.calls[0] ?? [];
      expect(url).toBe("https://api.example.test/v1/me");
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(init?.headers).toEqual({ Authorization: "Bearer id-token" });
    });

    it("maps 404 no_account", async () => {
      const fetchFn = fetchReturning(() =>
        jsonResponse(404, { error: "no_account" }),
      );
      expect(await getMe({ ...base, fetchFn })).toEqual({
        ok: false,
        status: 404,
        code: "no_account",
        message: accountsCopy.api.noAccount,
      });
    });
  });

  describe("DELETE /v1/me", () => {
    it("treats 204 as done", async () => {
      const fetchFn = fetchReturning(() => new Response(null, { status: 204 }));
      expect(await deleteMe({ ...base, fetchFn })).toEqual({ ok: true });
      const [url, init] = fetchFn.mock.calls[0] ?? [];
      expect(url).toBe("https://api.example.test/v1/me");
      expect(init?.method).toBe("DELETE");
      expect(init?.credentials).toBe("omit");
    });

    it("maps 401 reauth_required", async () => {
      const fetchFn = fetchReturning(() =>
        jsonResponse(401, { error: "reauth_required" }),
      );
      expect(await deleteMe({ ...base, fetchFn })).toEqual({
        ok: false,
        status: 401,
        code: "reauth_required",
        message: accountsCopy.api.reauthRequired,
      });
    });
  });

  it("status fallbacks", () => {
    expect(apiErrorMessage(0, "")).toBe(accountsCopy.api.network);
    expect(apiErrorMessage(401, "")).toBe(accountsCopy.api.unauthorized);
    expect(apiErrorMessage(500, "server_error")).toBe(
      accountsCopy.api.unavailable,
    );
  });
});

const pb = {
  mode: "time",
  mode2: "60",
  language: "english",
  punctuation: false,
  numbers: false,
  wpm: 85.4,
  rawWpm: 90.1,
  acc: 97.2,
  consistency: 80.5,
  achievedAt: "2026-11-18T10:00:00.000Z",
};

const submission = {
  mode: "time",
  mode2: "60",
  language: "english",
  punctuation: false,
  numbers: false,
  wpm: 85.4,
  rawWpm: 90.1,
  acc: 97.2,
  consistency: 80.5,
  durationS: 60,
};

const networkDown = (): ReturnType<typeof vi.fn<typeof fetch>> =>
  vi.fn<typeof fetch>(async () => {
    throw new TypeError("Failed to fetch");
  });

const networkFailure = {
  ok: false,
  status: 0,
  code: "",
  message: accountsCopy.api.network,
};

function expectBearerCall(
  fetchFn: ReturnType<typeof vi.fn<typeof fetch>>,
  method: string,
  path: string,
  body?: unknown,
): void {
  expect(fetchFn).toHaveBeenCalledTimes(1);
  const [url, init] = fetchFn.mock.calls[0] ?? [];
  expect(url).toBe(`https://api.example.test${path}`);
  expect(init?.method).toBe(method);
  expect(init?.credentials).toBe("omit");
  expect(init?.cache).toBe("no-store");
  expect(init?.signal).toBeInstanceOf(AbortSignal);
  if (body === undefined) {
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ Authorization: "Bearer id-token" });
  } else {
    expect(init?.headers).toEqual({
      Authorization: "Bearer id-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual(body);
  }
}

describe("GET /v1/me/settings", () => {
  it("returns the settings and updatedAt", async () => {
    const fetchFn = fetchReturning(() =>
      jsonResponse(200, {
        settings: { theme: "pug" },
        updatedAt: "2026-11-18T00:00:00.000Z",
      }),
    );
    expect(await getSettings({ ...base, fetchFn })).toEqual({
      ok: true,
      settings: { theme: "pug" },
      updatedAt: "2026-11-18T00:00:00.000Z",
    });
    expectBearerCall(fetchFn, "GET", "/v1/me/settings");
  });

  it("accepts updatedAt null (nothing saved yet)", async () => {
    const fetchFn = fetchReturning(() =>
      jsonResponse(200, { settings: {}, updatedAt: null }),
    );
    expect(await getSettings({ ...base, fetchFn })).toEqual({
      ok: true,
      settings: {},
      updatedAt: null,
    });
  });

  it.each([
    ["settings is an array", { settings: [], updatedAt: null }],
    ["settings missing", { updatedAt: null }],
    ["updatedAt missing", { settings: {} }],
    ["updatedAt a number", { settings: {}, updatedAt: 1 }],
  ])("rejects a malformed body (%s)", async (_label, body) => {
    const fetchFn = fetchReturning(() => jsonResponse(200, body));
    expect(await getSettings({ ...base, fetchFn })).toMatchObject({
      ok: false,
      code: "",
      message: accountsCopy.api.badResponse,
    });
  });

  it.each([
    [404, "no_account", accountsCopy.api.noAccount],
    [401, "unauthorized", accountsCopy.api.unauthorized],
    [500, "", accountsCopy.api.unavailable],
  ])("maps %i %s", async (status, code, message) => {
    const fetchFn = fetchReturning(() =>
      jsonResponse(status, code === "" ? {} : { error: code }),
    );
    expect(await getSettings({ ...base, fetchFn })).toEqual({
      ok: false,
      status,
      code,
      message,
    });
  });

  it("network failure", async () => {
    expect(await getSettings({ ...base, fetchFn: networkDown() })).toEqual(
      networkFailure,
    );
  });
});

describe("PUT /v1/me/settings", () => {
  it("sends the whole config as {settings}", async () => {
    const settings = { theme: "pug", time: 60 };
    const fetchFn = fetchReturning(() =>
      jsonResponse(200, { settings, updatedAt: "2026-11-18T00:00:00.000Z" }),
    );
    expect(await putSettings({ ...base, settings, fetchFn })).toEqual({
      ok: true,
      settings,
      updatedAt: "2026-11-18T00:00:00.000Z",
    });
    expectBearerCall(fetchFn, "PUT", "/v1/me/settings", { settings });
  });

  it.each([
    [404, "no_account", accountsCopy.api.noAccount],
    [413, "", accountsCopy.api.tooLarge],
    [413, "payload_too_large", accountsCopy.api.tooLarge],
    [401, "unauthorized", accountsCopy.api.unauthorized],
  ])("maps %i %s", async (status, code, message) => {
    const fetchFn = fetchReturning(() =>
      jsonResponse(status, code === "" ? {} : { error: code }),
    );
    expect(await putSettings({ ...base, settings: {}, fetchFn })).toEqual({
      ok: false,
      status,
      code,
      message,
    });
  });

  it("network failure and malformed body", async () => {
    expect(
      await putSettings({ ...base, settings: {}, fetchFn: networkDown() }),
    ).toEqual(networkFailure);
    const fetchFn = fetchReturning(() => jsonResponse(200, { ok: 1 }));
    expect(await putSettings({ ...base, settings: {}, fetchFn })).toMatchObject(
      { ok: false, message: accountsCopy.api.badResponse },
    );
  });
});

describe("POST /v1/me/personal-bests", () => {
  it("sends exactly the contract fields", async () => {
    const fetchFn = fetchReturning(() =>
      jsonResponse(200, { personalBest: pb, isNew: true }),
    );
    const extra = { ...submission, uid: "u1", email: "a@b.test", junk: 1 };
    expect(
      await submitPersonalBest({ ...base, personalBest: extra, fetchFn }),
    ).toEqual({ ok: true, personalBest: pb, isNew: true });
    expectBearerCall(fetchFn, "POST", "/v1/me/personal-bests", submission);
    const body = JSON.parse(fetchFn.mock.calls[0]?.[1]?.body as string);
    expect(Object.keys(body).sort()).toEqual(
      [
        "acc",
        "consistency",
        "durationS",
        "language",
        "mode",
        "mode2",
        "numbers",
        "punctuation",
        "rawWpm",
        "wpm",
      ].sort(),
    );
  });

  it("consistency may be null or left out", async () => {
    const fetchFn = fetchReturning(() =>
      jsonResponse(200, {
        personalBest: { ...pb, consistency: null },
        isNew: false,
      }),
    );
    const { consistency: _c, ...withoutConsistency } = submission;
    await submitPersonalBest({
      ...base,
      personalBest: withoutConsistency,
      fetchFn,
    });
    expect(
      JSON.parse(fetchFn.mock.calls[0]?.[1]?.body as string),
    ).not.toHaveProperty("consistency");
    expect(
      await submitPersonalBest({
        ...base,
        personalBest: { ...submission, consistency: null },
        fetchFn,
      }),
    ).toEqual({
      ok: true,
      personalBest: { ...pb, consistency: null },
      isNew: false,
    });
    expect(
      JSON.parse(fetchFn.mock.calls[1]?.[1]?.body as string).consistency,
    ).toBeNull();
  });

  it.each([
    [400, "invalid_pb", accountsCopy.api.invalidPb],
    [409, "pb_limit", accountsCopy.api.pbLimit],
    [404, "no_account", accountsCopy.api.noAccount],
    [413, "", accountsCopy.api.tooLarge],
    [401, "unauthorized", accountsCopy.api.unauthorized],
  ])("maps %i %s", async (status, code, message) => {
    const fetchFn = fetchReturning(() =>
      jsonResponse(status, code === "" ? {} : { error: code }),
    );
    expect(
      await submitPersonalBest({ ...base, personalBest: submission, fetchFn }),
    ).toEqual({ ok: false, status, code, message });
  });

  it.each([
    ["isNew missing", { personalBest: pb }],
    ["bad personalBest", { personalBest: { ...pb, wpm: "85" }, isNew: true }],
    ["not json", "nope"],
  ])("rejects a malformed body (%s)", async (_label, body) => {
    const fetchFn = fetchReturning(() =>
      typeof body === "string"
        ? new Response(body, { status: 200 })
        : jsonResponse(200, body),
    );
    expect(
      await submitPersonalBest({ ...base, personalBest: submission, fetchFn }),
    ).toMatchObject({ ok: false, message: accountsCopy.api.badResponse });
  });

  it("network failure", async () => {
    expect(
      await submitPersonalBest({
        ...base,
        personalBest: submission,
        fetchFn: networkDown(),
      }),
    ).toEqual(networkFailure);
  });
});

describe("GET /v1/me/personal-bests", () => {
  it("returns the list in the server's order", async () => {
    const second = { ...pb, mode: "words", mode2: "25" };
    const fetchFn = fetchReturning(() =>
      jsonResponse(200, { personalBests: [second, pb] }),
    );
    expect(await getPersonalBests({ ...base, fetchFn })).toEqual({
      ok: true,
      personalBests: [second, pb],
    });
    expectBearerCall(fetchFn, "GET", "/v1/me/personal-bests");
  });

  it("maps 404 no_account, network failure and a malformed body", async () => {
    const missing = fetchReturning(() =>
      jsonResponse(404, { error: "no_account" }),
    );
    expect(await getPersonalBests({ ...base, fetchFn: missing })).toEqual({
      ok: false,
      status: 404,
      code: "no_account",
      message: accountsCopy.api.noAccount,
    });
    expect(await getPersonalBests({ ...base, fetchFn: networkDown() })).toEqual(
      networkFailure,
    );
    const bad = fetchReturning(() =>
      jsonResponse(200, { personalBests: [{ ...pb, acc: null }] }),
    );
    expect(await getPersonalBests({ ...base, fetchFn: bad })).toMatchObject({
      ok: false,
      message: accountsCopy.api.badResponse,
    });
  });
});

describe("GET /v1/me/export", () => {
  const file = {
    format: 1,
    exportedAt: "2026-11-18T00:00:00.000Z",
    account: { uid: "u1" },
    settings: {},
    settingsUpdatedAt: null,
    personalBests: [],
    results: [],
  };

  it("returns the whole file", async () => {
    const fetchFn = fetchReturning(() => jsonResponse(200, file));
    expect(await exportMyData({ ...base, fetchFn })).toEqual({
      ok: true,
      data: file,
    });
    expectBearerCall(fetchFn, "GET", "/v1/me/export");
  });

  it.each([
    ["unknown format", { ...file, format: 2 }],
    ["an array", [file]],
  ])("rejects a malformed file (%s)", async (_label, body) => {
    const fetchFn = fetchReturning(() => jsonResponse(200, body));
    expect(await exportMyData({ ...base, fetchFn })).toMatchObject({
      ok: false,
      message: accountsCopy.api.badResponse,
    });
  });

  it("maps 404 no_account and network failure", async () => {
    const fetchFn = fetchReturning(() =>
      jsonResponse(404, { error: "no_account" }),
    );
    expect(await exportMyData({ ...base, fetchFn })).toMatchObject({
      ok: false,
      code: "no_account",
      message: accountsCopy.api.noAccount,
    });
    expect(await exportMyData({ ...base, fetchFn: networkDown() })).toEqual(
      networkFailure,
    );
  });
});
