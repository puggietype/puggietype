import { describe, expect, it, vi } from "vitest";

import {
  apiErrorMessage,
  apiUrlFor,
  createSession,
  deleteMe,
  getMe,
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
