import { z } from "zod";

import { accountsCopy } from "./strings";

// GET/POST /v1/auth/session and /v1/me: `user` as the accounts API returns it
const AccountUserSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string(),
  emailVerified: z.boolean(),
  ageOk: z.boolean(),
  lbListed: z.boolean(),
  verifiedTypist: z.boolean(),
  status: z.string(),
  createdAt: z.string(),
  statusReason: z.string().nullish(),
  statusNoticeRef: z.string().nullish(),
});
export type AccountUser = z.infer<typeof AccountUserSchema>;

const UserBodySchema = z.object({ user: AccountUserSchema });

/** a refused or failed call; `code` is the API's `{"error"}` code, or "" */
export type ApiFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type SessionResult =
  | { ok: true; user: AccountUser; created: boolean }
  | ApiFailure;
export type MeResult = { ok: true; user: AccountUser } | ApiFailure;
export type DeleteResult = { ok: true } | ApiFailure;

type CallOptions = {
  apiUrl: string;
  idToken: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

// Neon cold starts add ~1 s; anything near this is a dead request
const DEFAULT_TIMEOUT_MS = 15_000;
const ERROR_CODE_RE = /^[a-z_]{1,40}$/;

export function apiUrlFor(apiUrl: string, path: string): string {
  return `${apiUrl.replace(/\/+$/, "")}${path}`;
}

/** fixed client-side text per code/status; server bodies are never shown */
export function apiErrorMessage(status: number, code: string): string {
  const copy = accountsCopy.api;
  switch (code) {
    case "turnstile_failed":
      return copy.turnstileFailed;
    case "turnstile_unavailable":
      return copy.turnstileUnavailable;
    case "unauthorized":
      return copy.unauthorized;
    case "age_check_required":
      return copy.ageCheckRequired;
    case "reauth_required":
      return copy.reauthRequired;
    case "no_account":
      return copy.noAccount;
  }
  if (status === 0) return copy.network;
  if (status === 401) return copy.unauthorized;
  if (status === 429) return copy.rateLimited;
  if (status >= 500) return copy.unavailable;
  return copy.failed(status);
}

function failure(status: number, code = ""): ApiFailure {
  return { ok: false, status, code, message: apiErrorMessage(status, code) };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

async function errorCode(response: Response): Promise<string> {
  const body = await readJson(response);
  const code =
    typeof body === "object" && body !== null && "error" in body
      ? body.error
      : undefined;
  return typeof code === "string" && ERROR_CODE_RE.test(code) ? code : "";
}

/** one bearer-token call; token auth only, no cookies, never cached */
async function call(
  options: CallOptions,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<Response | ApiFailure> {
  if (options.apiUrl === "") return failure(0);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.idToken}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const response = await (options.fetchFn ?? fetch)(
      apiUrlFor(options.apiUrl, path),
      {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return failure(response.status, await errorCode(response));
    }
    return response;
  } catch {
    return failure(0);
  }
}

async function readUser(response: Response): Promise<AccountUser | ApiFailure> {
  const parsed = UserBodySchema.safeParse(await readJson(response));
  if (parsed.success) return parsed.data.user;
  return {
    ok: false,
    status: response.status,
    code: "",
    message: accountsCopy.api.badResponse,
  };
}

/**
 * POST /v1/auth/session: trades a Firebase ID token plus a Turnstile token
 * for the account (201 created, 200 existing). `ageOk` is the client's 13+
 * result, only sent as `true` and only needed when the account is created.
 */
export async function createSession(
  options: CallOptions & { turnstileToken: string; ageOk?: true },
): Promise<SessionResult> {
  const response = await call(options, "POST", "/v1/auth/session", {
    turnstileToken: options.turnstileToken,
    ...(options.ageOk === true ? { ageOk: true } : {}),
  });
  if (!(response instanceof Response)) return response;
  const user = await readUser(response);
  if ("ok" in user) return user;
  return { ok: true, user, created: response.status === 201 };
}

/** GET /v1/me: the signed-in account (404 `no_account` if none) */
export async function getMe(options: CallOptions): Promise<MeResult> {
  const response = await call(options, "GET", "/v1/me");
  if (!(response instanceof Response)) return response;
  const user = await readUser(response);
  if ("ok" in user) return user;
  return { ok: true, user };
}

/** DELETE /v1/me: 204, idempotent; 401 `reauth_required` if sign-in is old */
export async function deleteMe(options: CallOptions): Promise<DeleteResult> {
  const response = await call(options, "DELETE", "/v1/me");
  if (!(response instanceof Response)) return response;
  return { ok: true };
}
