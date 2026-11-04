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
};

export type SteamSignInError =
  | "unavailable"
  | "cancelled"
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
  const response = await steam.signIn();
  if (response === null) return { ok: false, error: "cancelled" };
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
  return {
    ok: true,
    value: {
      steamId: r.steamId,
      ownsApp: r.ownsApp === true,
      displayName: steamDisplayName(
        typeof r.personaName === "string" ? r.personaName : null,
        isSteamNameHidden(deps.storage),
      ),
    },
  };
}
