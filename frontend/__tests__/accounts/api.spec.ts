import { describe, expect, it, vi } from "vitest";

import {
  createSession,
  sessionErrorMessage,
  sessionUrl,
} from "../../src/ts/accounts/api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const base = {
  apiUrl: "https://api.example.test",
  idToken: "id-token",
  turnstileToken: "ts-token",
};

describe("accounts api client", () => {
  it("builds the session url without double slashes", () => {
    expect(sessionUrl("https://api.example.test")).toBe(
      "https://api.example.test/v1/auth/session",
    );
    expect(sessionUrl("https://api.example.test/")).toBe(
      "https://api.example.test/v1/auth/session",
    );
    expect(sessionUrl("https://example.test/api//")).toBe(
      "https://example.test/api/v1/auth/session",
    );
  });

  it("POSTs the bearer token and turnstile token, no cookies", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse(200, { uid: "u1", emailVerified: true }),
    );
    const result = await createSession({ ...base, fetchFn });

    expect(result).toEqual({
      ok: true,
      user: { uid: "u1", emailVerified: true },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
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

  it("ignores extra response fields", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse(200, { uid: "u1", emailVerified: false, extra: 1 }),
    );
    expect(await createSession({ ...base, fetchFn })).toEqual({
      ok: true,
      user: { uid: "u1", emailVerified: false },
    });
  });

  it.each([400, 401, 403, 429, 500, 503, 418])(
    "maps HTTP %i to a fixed message, never the server body",
    async (status) => {
      const fetchFn = vi.fn<typeof fetch>(async () =>
        jsonResponse(status, { message: "<b>server text</b>" }),
      );
      const result = await createSession({ ...base, fetchFn });
      expect(result).toEqual({
        ok: false,
        status,
        message: sessionErrorMessage(status),
      });
      if (!result.ok) expect(result.message).not.toContain("server text");
    },
  );

  it("reports network errors and timeouts as status 0", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await createSession({ ...base, fetchFn })).toEqual({
      ok: false,
      status: 0,
      message: sessionErrorMessage(0),
    });
  });

  it("aborts after the timeout", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("timeout", "TimeoutError")),
          );
        }),
    );
    const result = await createSession({ ...base, fetchFn, timeoutMs: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(0);
  });

  it.each([
    ["not json", new Response("nope", { status: 200 })],
    ["missing uid", jsonResponse(200, { emailVerified: true })],
    ["empty uid", jsonResponse(200, { uid: "", emailVerified: true })],
    ["wrong type", jsonResponse(200, { uid: "u1", emailVerified: "yes" })],
  ])("rejects a malformed 200 (%s)", async (_label, response) => {
    const fetchFn = vi.fn<typeof fetch>(async () => response);
    const result = await createSession({ ...base, fetchFn });
    expect(result.ok).toBe(false);
  });

  it("does not call fetch when no api url is configured", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const result = await createSession({ ...base, apiUrl: "", fetchFn });
    expect(result.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
