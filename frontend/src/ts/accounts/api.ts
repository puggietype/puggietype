import { z } from "zod";

const SessionUserSchema = z.object({
  uid: z.string().min(1),
  emailVerified: z.boolean(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export type SessionResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: number; message: string };

// Neon cold starts add ~1 s; anything near this is a dead request
const DEFAULT_TIMEOUT_MS = 15_000;

export function sessionUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, "")}/v1/auth/session`;
}

/** fixed client-side text per status; server error bodies are never shown */
export function sessionErrorMessage(status: number): string {
  if (status === 0) return "Could not reach the accounts service";
  if (status === 400 || status === 403) {
    return "The bot check failed, please try again";
  }
  if (status === 401) return "Sign-in could not be verified";
  if (status === 429) return "Too many attempts, please wait and try again";
  if (status >= 500) return "Accounts are unavailable right now";
  return `Sign-in failed (${status})`;
}

/**
 * POST /v1/auth/session: trades a Firebase ID token plus a Turnstile token
 * for the API's view of the user. Token auth only, no cookies.
 */
export async function createSession(options: {
  apiUrl: string;
  idToken: string;
  turnstileToken: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<SessionResult> {
  const fetchFn = options.fetchFn ?? fetch;
  if (options.apiUrl === "") {
    return { ok: false, status: 0, message: sessionErrorMessage(0) };
  }

  let response: Response;
  try {
    response = await fetchFn(sessionUrl(options.apiUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ turnstileToken: options.turnstileToken }),
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, message: sessionErrorMessage(0) };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: sessionErrorMessage(response.status),
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const parsed = SessionUserSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: response.status,
      message: "Unexpected response from the accounts service",
    };
  }
  return { ok: true, user: parsed.data };
}
