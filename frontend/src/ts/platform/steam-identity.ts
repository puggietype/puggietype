import { UserNameSchema } from "@monkeytype/schemas/users";
import type { DesktopBridge } from "./desktop-bridge";
import type { PlatformStorage } from "./types";

/**
 * Steam M3 sign-in (steam flavor only). The desktop shell runs Steam OpenID
 * 2.0 in the system browser with a loopback return and hands back the signed
 * openid.* response; the game server verifies it with Steam and checks
 * ownership (POST /steam/auth). No Steamworks SDK.
 */
/**
 * Legal review 2026-11-04 (P3-8): the sign-in UI must show this before it
 * opens Steam, because Steam names the loopback realm as the requester.
 */
export const STEAM_SIGNIN_HINT =
  "Steam will show this sign-in as coming from 127.0.0.1 (your own computer).";

export type SteamSignIn = {
  steamId: string;
  /**
   * Informational only (Legal P1-2). Never gate anything on it: paid or DLC
   * features must be checked by the server, which re-checks ownership itself
   * (or binds it to a server-issued token). Entitlements come only from
   * PlatformAdapter.entitlements, which does not read this value.
   */
  ownsApp: boolean;
  /** persona name if it passes the web name filter and is not hidden */
  displayName: string | null;
  /**
   * persona name if it passes the web name filter, before the hide setting,
   * so the UI can re-apply the hide toggle without signing in again. Memory
   * only; never stored.
   */
  personaName: string | null;
};

export type SteamSignInError =
  | "unavailable"
  | "cancelled"
  | "timeout"
  | "busy"
  | "feature_off"
  | "not_verified"
  | "steam_unavailable"
  | "network";

export const STEAM_NAME_HIDDEN_KEY = "steamNameHidden";

export function isSteamNameHidden(storage: PlatformStorage): boolean {
  return storage.getItem(STEAM_NAME_HIDDEN_KEY) === "1";
}

export function setSteamNameHidden(
  storage: PlatformStorage,
  hidden: boolean,
): void {
  if (hidden) storage.setItem(STEAM_NAME_HIDDEN_KEY, "1");
  else storage.removeItem(STEAM_NAME_HIDDEN_KEY);
}

/** Steam persona names go through the same filter as web usernames. */
export function steamDisplayName(
  persona: string | null | undefined,
  hidden: boolean,
): string | null {
  if (hidden || typeof persona !== "string") return null;
  return UserNameSchema.safeParse(persona).success ? persona : null;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

export async function signInWithSteam(deps: {
  bridge: DesktopBridge | undefined;
  serverBase: string;
  storage: PlatformStorage;
  fetch?: FetchLike;
}): Promise<
  { ok: true; value: SteamSignIn } | { ok: false; error: SteamSignInError }
> {
  const steam = deps.bridge?.steam;
  if (!steam) return { ok: false, error: "unavailable" };
  let response: Awaited<ReturnType<typeof steam.signIn>>;
  try {
    response = await steam.signIn();
  } catch {
    return { ok: false, error: "cancelled" };
  }
  if (response === null) return { ok: false, error: "cancelled" };
  if ("error" in response) {
    if (response.error === "timeout") return { ok: false, error: "timeout" };
    if (response.error === "busy") return { ok: false, error: "busy" };
    return { ok: false, error: "cancelled" };
  }
  const doFetch = deps.fetch ?? fetch;
  let status: number;
  let body: unknown;
  try {
    const res = await doFetch(
      new URL("/steam/auth", `${deps.serverBase.replace(/\/$/, "")}/`).href,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ openid: response.openid }),
      },
    );
    status = res.status;
    // 404: the server runs without FEATURE_STEAM_AUTH (no /steam/auth route)
    if (status === 404) return { ok: false, error: "feature_off" };
    body = await res.json();
  } catch {
    return { ok: false, error: "network" };
  }
  const r = body as {
    ok?: unknown;
    steamId?: unknown;
    ownsApp?: unknown;
    personaName?: unknown;
  };
  if (status !== 200 || r.ok !== true || typeof r.steamId !== "string") {
    return {
      ok: false,
      error: status === 502 ? "steam_unavailable" : "not_verified",
    };
  }
  keepSessionToken(steam, body);
  return {
    ok: true,
    value: signInValue(r as { steamId: string }, deps.storage),
  };
}

function signInValue(
  r: { steamId: string; ownsApp?: unknown; personaName?: unknown },
  storage: PlatformStorage,
): SteamSignIn {
  return {
    steamId: r.steamId,
    ownsApp: r.ownsApp === true,
    displayName: steamDisplayName(
      typeof r.personaName === "string" ? r.personaName : null,
      isSteamNameHidden(storage),
    ),
    personaName: steamDisplayName(
      typeof r.personaName === "string" ? r.personaName : null,
      false,
    ),
  };
}

const SESSION_TOKEN_RX = /^[A-Za-z0-9_-]{43}$/;

type SteamBridge = NonNullable<DesktopBridge["steam"]>;

/** Keeps a server-issued session token in secure storage (if any). */
function keepSessionToken(steam: SteamBridge, body: unknown): void {
  const token = (body as { sessionToken?: unknown } | null)?.sessionToken;
  if (typeof token === "string" && SESSION_TOKEN_RX.test(token)) {
    steam.session?.set(token);
  }
}

function sessionUrl(serverBase: string, path: string): string {
  return new URL(path, `${serverBase.replace(/\/$/, "")}/`).href;
}

type SessionDeps = {
  bridge: DesktopBridge | undefined;
  serverBase: string;
  storage: PlatformStorage;
  fetch?: FetchLike;
};

async function postToken(
  deps: SessionDeps,
  path: string,
  token: string,
): Promise<{ status: number; body: unknown } | undefined> {
  try {
    const res = await (deps.fetch ?? fetch)(sessionUrl(deps.serverBase, path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return undefined;
  }
}

/** Whether a session token is kept on this device. */
export function hasSteamSession(bridge: DesktopBridge | undefined): boolean {
  return typeof bridge?.steam?.session?.get() === "string";
}

/**
 * Silent sign-in at launch with the kept session token. The server rotates
 * the token on every use, so the new one replaces it. A token the server no
 * longer accepts (expired, revoked, or the feature is off) is deleted and
 * the player signs in with OpenID again ("none").
 */
export async function resumeSteamSession(
  deps: SessionDeps,
): Promise<
  | { ok: true; value: SteamSignIn }
  | { ok: false; error: "none" | "steam_unavailable" | "network" }
> {
  const steam = deps.bridge?.steam;
  const token = steam?.session?.get();
  if (!steam || typeof token !== "string") return { ok: false, error: "none" };
  const r = await postToken(deps, "/steam/session", token);
  if (r === undefined) return { ok: false, error: "network" };
  keepSessionToken(steam, r.body);
  const b = r.body as { ok?: unknown; steamId?: unknown } | null;
  if (r.status === 200 && b?.ok === true && typeof b.steamId === "string") {
    return {
      ok: true,
      value: signInValue(b as { steamId: string }, deps.storage),
    };
  }
  if (r.status === 502) return { ok: false, error: "steam_unavailable" };
  if (r.status >= 500 || r.status === 429) {
    return { ok: false, error: "network" };
  }
  steam.session?.clear();
  return { ok: false, error: "none" };
}

/** Sign-out: deletes the kept token, then tells the server (best effort). */
export async function signOutSteam(deps: SessionDeps): Promise<void> {
  const session = deps.bridge?.steam?.session;
  const token = session?.get();
  session?.clear();
  if (typeof token === "string") {
    await postToken(deps, "/steam/session/signout", token);
  }
}

export type SteamDeleteError = "expired" | "network";

/**
 * "Delete my account": POST /steam/account/delete with the kept token. On
 * success the token is deleted from secure storage. "expired": the server
 * no longer accepts the token (it is deleted too); sign in again first.
 */
export async function deleteSteamAccount(
  deps: SessionDeps,
): Promise<{ ok: true } | { ok: false; error: SteamDeleteError }> {
  const session = deps.bridge?.steam?.session;
  const token = session?.get();
  if (typeof token !== "string") return { ok: false, error: "expired" };
  const r = await postToken(deps, "/steam/account/delete", token);
  if (r === undefined) return { ok: false, error: "network" };
  if (r.status === 200 && (r.body as { ok?: unknown } | null)?.ok === true) {
    session?.clear();
    return { ok: true };
  }
  if (r.status === 401 || r.status === 404) {
    session?.clear();
    return { ok: false, error: "expired" };
  }
  return { ok: false, error: "network" };
}
