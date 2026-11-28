import { createSignal } from "solid-js";

import { CONFIGURED_WS_URL } from "../multiplayer/flags";
import { leaderboardHttpBase } from "../multiplayer/leaderboards";
import { getPlatform } from "../platform";
import { getDesktopBridge } from "../platform/desktop-bridge";
import {
  hasSteamSession,
  resumeSteamSession,
  signInWithSteamTicket,
  type SteamSignIn,
} from "../platform/steam-identity";

/**
 * Steam sign-in state shared by the launch-time silent sign-in and the
 * settings UI (steam build only; loaded from a lazy chunk). Memory only.
 */
export type SteamLaunchState =
  | { kind: "idle" }
  | { kind: "resuming" }
  | { kind: "signedIn"; value: SteamSignIn };

const [launchState, setLaunchState] = createSignal<SteamLaunchState>({
  kind: "idle",
});
export {
  launchState as steamLaunchState,
  setLaunchState as setSteamLaunchState,
};

export function steamSessionDeps(): Parameters<typeof resumeSteamSession>[0] {
  return {
    bridge: getDesktopBridge(),
    serverBase: leaderboardHttpBase(window.location, CONFIGURED_WS_URL),
    storage: getPlatform().storage,
  };
}

let started: Promise<void> | undefined;

/**
 * At launch: sign in silently with the kept session token, else with a
 * one-time Steam ticket when the helper is on. Otherwise nothing is shown and the player can
 * sign in with Steam OpenID from settings as before.
 */
export async function startSilentSteamSignIn(
  resume: typeof resumeSteamSession = resumeSteamSession,
  ticket: typeof signInWithSteamTicket = signInWithSteamTicket,
): Promise<void> {
  started ??= (async () => {
    const steam = getDesktopBridge()?.steam;
    if (steam?.session === undefined && steam?.ticket === undefined) return;
    setLaunchState({ kind: "resuming" });
    // Legal C37-1: 1. the kept session token, 2. a one-time Steam ticket
    // (optional helper), 3. nothing: the OpenID button in settings. A token
    // the server rejects is cleared by resume; while one is still kept (e.g.
    // the server was unreachable) no ticket is tried, so a new token family
    // never replaces one the server still holds.
    const r = await resume(steamSessionDeps());
    if (r.ok) {
      setLaunchState({ kind: "signedIn", value: r.value });
      return;
    }
    if (hasSteamSession(getDesktopBridge())) {
      setLaunchState({ kind: "idle" });
      return;
    }
    const t = await ticket(steamSessionDeps());
    setLaunchState(
      t.ok ? { kind: "signedIn", value: t.value } : { kind: "idle" },
    );
  })();
  return started;
}

/** tests only */
export function __resetSteamSessionForTests(): void {
  started = undefined;
  setLaunchState({ kind: "idle" });
}
