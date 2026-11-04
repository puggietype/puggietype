import { createSignal, JSXElement, Match, Show, Switch } from "solid-js";

import { CONFIGURED_WS_URL } from "../../../../multiplayer/flags";
import { leaderboardHttpBase } from "../../../../multiplayer/leaderboards";
import { getPlatform } from "../../../../platform";
import { getDesktopBridge } from "../../../../platform/desktop-bridge";
import {
  isSteamNameHidden,
  setSteamNameHidden,
  signInWithSteam,
  STEAM_SIGNIN_HINT,
  steamDisplayName,
  type SteamSignIn as SteamSignInValue,
  type SteamSignInError,
} from "../../../../platform/steam-identity";
import { Button } from "../../../common/Button";
import { SearchableSetting } from "../SearchableSetting";

/**
 * Steam M3 sign-in (steam build only, and only when the desktop shell runs
 * with PUGGIE_STEAM_OPENID=1). Plain text label, no Steam logo or branding.
 * The result is informational: nothing here unlocks content (entitlements
 * stay server-checked, Legal P1-2). Signed-in state lives in memory only.
 */
type State =
  | { kind: "signedOut" }
  | { kind: "hint" }
  | { kind: "pending" }
  | { kind: "signedIn"; value: SteamSignInValue }
  | { kind: "error"; error: SteamSignInError };

export const STEAM_SIGNIN_ERROR_TEXT: Record<SteamSignInError, string> = {
  cancelled: "Sign-in was cancelled or couldn't finish. Please try again.",
  timeout: "Sign-in timed out. Please try again.",
  busy: "A sign-in is already open in your browser.",
  feature_off: "Steam sign-in isn't available right now.",
  not_verified: "We couldn't verify this sign-in with Steam. Please try again.",
  steam_unavailable: "Steam is not responding. Please try again later.",
  network: "Couldn't reach the PuggieType server. Check your connection.",
  unavailable: "Steam sign-in isn't available in this version.",
};

function errorOf(s: State): SteamSignInError | undefined {
  return s.kind === "error" ? s.error : undefined;
}

export function SteamSignIn(props: {
  signIn?: typeof signInWithSteam;
}): JSXElement {
  const platform = getPlatform();
  const storage = platform.storage;
  const [state, setState] = createSignal<State>({ kind: "signedOut" });
  const [hidden, setHidden] = createSignal(isSteamNameHidden(storage));

  const shownName = (): string | null => {
    const s = state();
    return s.kind === "signedIn"
      ? steamDisplayName(s.value.personaName, hidden())
      : null;
  };

  const proceed = async (): Promise<void> => {
    setState({ kind: "pending" });
    const r = await (props.signIn ?? signInWithSteam)({
      bridge: getDesktopBridge(),
      serverBase: leaderboardHttpBase(window.location, CONFIGURED_WS_URL),
      storage,
    });
    setState(
      r.ok
        ? { kind: "signedIn", value: r.value }
        : { kind: "error", error: r.error },
    );
  };

  const toggleHidden = (next: boolean): void => {
    setSteamNameHidden(storage, next);
    setHidden(next);
  };

  return (
    <Show when={platform.identity.isAvailable()}>
      <SearchableSetting
        key="steamSignIn"
        title="steam sign-in"
        description={
          <span data-testid="steam-signin-description">
            {
              "Sign in with your Steam account. PuggieType receives your Steam ID, whether you own PuggieType and its supporter pack, and your Steam display name. We don't store any of these; see our "
            }
            <Button
              variant="text"
              href="/privacy"
              text="privacy policy"
              class="p-0"
            />
            .
          </span>
        }
        fa={{ icon: "fa-user" }}
        inputs={
          <div data-testid="steam-signin" class="grid gap-2">
            <Switch>
              <Match when={state().kind === "hint"}>
                <div
                  role="dialog"
                  aria-modal="false"
                  aria-labelledby="steam-signin-hint-text"
                  data-testid="steam-signin-hint"
                  class="grid gap-2"
                >
                  <p id="steam-signin-hint-text">{STEAM_SIGNIN_HINT}</p>
                  <div class="grid grid-cols-2 gap-2">
                    <Button
                      id="steam-signin-continue"
                      onClick={() => void proceed()}
                      text="continue"
                    />
                    <Button
                      id="steam-signin-back"
                      onClick={() => setState({ kind: "signedOut" })}
                      text="cancel"
                    />
                  </div>
                </div>
              </Match>
              <Match when={state().kind === "pending"}>
                <p data-testid="steam-signin-pending">
                  Waiting for Steam in your browser...
                </p>
              </Match>
              <Match when={state().kind === "signedIn"}>
                <p data-testid="steam-signin-signed-in">
                  <Show when={shownName()} fallback="Signed in with Steam.">
                    {(name) => (
                      <>
                        Signed in with Steam as{" "}
                        <span data-testid="steam-signin-name">{name()}</span>.
                      </>
                    )}
                  </Show>
                </p>
                <Button
                  id="steam-signout"
                  onClick={() => setState({ kind: "signedOut" })}
                  text="sign out"
                />
              </Match>
              <Match when={true}>
                <Show when={errorOf(state())}>
                  {(error) => (
                    <p data-testid="steam-signin-error" role="status">
                      {STEAM_SIGNIN_ERROR_TEXT[error()]}
                    </p>
                  )}
                </Show>
                <Button
                  id="steam-signin-button"
                  onClick={() => setState({ kind: "hint" })}
                  text="Sign in with Steam"
                />
              </Match>
            </Switch>
          </div>
        }
      />
      <SearchableSetting
        key="steamNameHidden"
        title="hide steam name"
        description="Don't show your Steam display name in PuggieType."
        fa={{ icon: "fa-eye-slash" }}
        inputs={
          <div
            data-testid="steam-name-hidden"
            class="grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2"
          >
            <Button
              id="steam-name-hidden-off"
              active={!hidden()}
              ariaPressed={!hidden()}
              onClick={() => toggleHidden(false)}
              text="off"
            />
            <Button
              id="steam-name-hidden-on"
              active={hidden()}
              ariaPressed={hidden()}
              onClick={() => toggleHidden(true)}
              text="on"
            />
          </div>
        }
      />
    </Show>
  );
}
