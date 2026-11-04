import { createSignal } from "solid-js";

import { CONFIGURED_WS_URL } from "../multiplayer/flags";
import { leaderboardHttpBase } from "../multiplayer/leaderboards";
import { getPlatform } from "../platform";
import { getDesktopBridge } from "../platform/desktop-bridge";
import {
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
 * At launch: sign in silently with the kept session token. Without one, or
 * when the server no longer accepts it, nothing is shown and the player can
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
    // 1. a one-time Steam ticket (optional helper), 2. the kept session
    // token, 3. nothing: the OpenID button in settings
    const t = await ticket(steamSessionDeps());
    if (t.ok) {
      setLaunchState({ kind: "signedIn", value: t.value });
      return;
    }
    const r = await resume(steamSessionDeps());
    setLaunchState(
      r.ok ? { kind: "signedIn", value: r.value } : { kind: "idle" },
    );
  })();
  return started;
}

/** tests only */
export function __resetSteamSessionForTests(): void {
  started = undefined;
  setLaunchState({ kind: "idle" });
}
