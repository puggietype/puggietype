import {
  createEffect,
  createSignal,
  JSXElement,
  Match,
  on,
  Show,
  Switch,
} from "solid-js";

import { CONFIGURED_WS_URL } from "../../../../multiplayer/flags";
import { leaderboardHttpBase } from "../../../../multiplayer/leaderboards";
import { getPlatform } from "../../../../platform";
import { getDesktopBridge } from "../../../../platform/desktop-bridge";
import {
  canKeepSession,
  deleteSteamAccount,
  hasSteamSession,
  isSteamNameHidden,
  setSteamNameHidden,
  signInWithSteam,
  signOutSteam,
  steamSessionsOn,
  type SteamDeleteError,
  STEAM_SIGNIN_HINT,
  steamDisplayName,
  type SteamSignIn as SteamSignInValue,
  type SteamSignInError,
} from "../../../../platform/steam-identity";
import {
  steamLaunchState,
  steamSessionDeps,
} from "../../../../steam/steam-session";
import { Button } from "../../../common/Button";
import { SearchableSetting } from "../SearchableSetting";
import "./steam-signin.css";

/**
 * Steam M3 sign-in (steam build only, and only when the desktop shell runs
 * with PUGGIE_STEAM_OPENID=1). Plain text label, no Steam logo or branding.
 * The result is informational: nothing here unlocks content (entitlements
 * stay server-checked, Legal P1-2). Signed-in state lives in memory only.
 */
type State =
  | { kind: "signedOut"; notice?: "deleted" | "expired" }
  | { kind: "hint" }
  | { kind: "pending" }
  | { kind: "resuming" }
  | { kind: "signedIn"; value: SteamSignInValue; deleteError?: "network" }
  | { kind: "confirmDelete"; value: SteamSignInValue }
  | { kind: "deleting"; value: SteamSignInValue }
  | { kind: "error"; error: SteamSignInError };

/** "Delete my sign-in data" texts (Legal review 2026-11-04, F3, exact). */
export const STEAM_DELETE_TEXT = {
  button: "Delete my sign-in data",
  confirm:
    "Delete your Steam sign-in data? This removes your sign-in from PuggieType's server on all your devices. Each device will need to sign in with Steam again the next time it starts PuggieType. Your settings and scores on this device are not affected.",
  confirmButton: "Yes, delete it",
  cancel: "cancel",
  pending: "Deleting your sign-in data...",
  done: "Your sign-in data was deleted. You're signed out.",
  expired:
    "Your sign-in has expired. Sign in with Steam again, then delete your sign-in data.",
  network:
    "Couldn't delete your sign-in data. Check your connection and try again.",
} as const;

/**
 * Sign-in description (Legal F1): the original text while the server issues
 * no session tokens; once it does (or a token is kept here), the text that
 * says what is stored.
 */
export const STEAM_SIGNIN_DESCRIPTION = {
  noTokens:
    "Sign in with your Steam account. PuggieType receives your Steam ID, whether you own PuggieType and its supporter pack, and your Steam display name. We don't store any of these; see our ",
  maybeTokens:
    "Sign in with your Steam account. PuggieType receives your Steam ID, whether you own PuggieType and its supporter pack, and your Steam display name. If PuggieType keeps you signed in, we store your Steam ID with a scrambled sign-in token, never your name or what you own; see our ",
  tokens:
    "Sign in with your Steam account. PuggieType receives your Steam ID, whether you own PuggieType and its supporter pack, and your Steam display name. To keep you signed in, we store your Steam ID with a scrambled sign-in token, never your name or what you own; see our ",
} as const;

export const STEAM_RESUMING_TEXT = "Signing in with Steam...";

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
  signOut?: typeof signOutSteam;
  deleteAccount?: typeof deleteSteamAccount;
}): JSXElement {
  const platform = getPlatform();
  const storage = platform.storage;
  const fromLaunch = (): State => {
    const l = steamLaunchState();
    return l.kind === "idle" ? { kind: "signedOut" } : l;
  };
  const [state, setState] = createSignal<State>(fromLaunch());
  // launch-time silent sign-in (steam-session.ts) feeds this UI until the
  // player does something here
  createEffect(
    on(
      steamLaunchState,
      (l) => {
        const k = state().kind;
        if (k !== "signedOut" && k !== "resuming") return;
        if (l.kind === "resuming") {
          setState({ kind: "resuming" });
        } else if (l.kind === "signedIn") {
          setState({ kind: "signedIn", value: l.value });
        } else if (k === "resuming") {
          setState({ kind: "signedOut" });
        }
      },
      { defer: true },
    ),
  );
  const signedInValue = (): SteamSignInValue | undefined => {
    const s = state();
    return s.kind === "signedIn" ||
      s.kind === "confirmDelete" ||
      s.kind === "deleting"
      ? s.value
      : undefined;
  };
  const canDelete = (): boolean => hasSteamSession(getDesktopBridge());
  // re-read after every sign-in step (state changes)
  const tokensStored = (): boolean => {
    state();
    return canDelete() || steamSessionsOn(storage);
  };
  // Legal C35-1: "noTokens" only where keep:false applies (nothing can be
  // kept); a device that could keep a token but hasn't seen one yet gets the
  // conditional text, so it's true at the moment of collection
  const description = (): string =>
    tokensStored()
      ? STEAM_SIGNIN_DESCRIPTION.tokens
      : canKeepSession(getDesktopBridge())
        ? STEAM_SIGNIN_DESCRIPTION.maybeTokens
        : STEAM_SIGNIN_DESCRIPTION.noTokens;
  const [hidden, setHidden] = createSignal(isSteamNameHidden(storage));

  const shownName = (): string | null => {
    const s = state();
    const v = signedInValue();
    return v && s.kind !== "deleting"
      ? steamDisplayName(v.personaName, hidden())
      : null;
  };

  // Focus (QA P2 A11Y): hint -> continue; pending -> the status line; result
  // -> sign out or the sign-in button; cancel / sign out -> sign-in button.
  // Solid renders <Switch> branches synchronously, so the target exists.
  const focus = (id: string): void => document.getElementById(id)?.focus();

  const openHint = (): void => {
    setState({ kind: "hint" });
    focus("steam-signin-continue");
  };

  const backToSignedOut = (): void => {
    setState({ kind: "signedOut" });
    focus("steam-signin-button");
  };

  const proceed = async (): Promise<void> => {
    setState({ kind: "pending" });
    focus("steam-signin-pending");
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
    focus(r.ok ? "steam-signout" : "steam-signin-button");
  };

  const signOut = (): void => {
    void (props.signOut ?? signOutSteam)(steamSessionDeps());
    backToSignedOut();
  };

  // Delete my sign-in data: a confirmation step first (focus goes to cancel, the
  // safe choice; Escape cancels). Plain buttons, so keyboard and controller
  // navigation work as everywhere else.
  const askDelete = (): void => {
    const v = signedInValue();
    if (!v) return;
    setState({ kind: "confirmDelete", value: v });
    focus("steam-delete-cancel");
  };
  const cancelDelete = (): void => {
    const v = signedInValue();
    if (!v) return;
    setState({ kind: "signedIn", value: v });
    focus("steam-delete-button");
  };
  const confirmDelete = async (): Promise<void> => {
    const v = signedInValue();
    if (!v) return;
    setState({ kind: "deleting", value: v });
    focus("steam-delete-pending");
    const r = await (props.deleteAccount ?? deleteSteamAccount)(
      steamSessionDeps(),
    );
    if (r.ok || r.error === ("expired" satisfies SteamDeleteError)) {
      setState({ kind: "signedOut", notice: r.ok ? "deleted" : "expired" });
      focus("steam-signin-button");
      return;
    }
    setState({ kind: "signedIn", value: v, deleteError: "network" });
    focus("steam-delete-button");
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
            {description()}
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
            {/* SR-ANNOUNCE: one live region, mounted for the whole life of
                the setting, so screen readers reliably announce pending,
                signed-in and error text (a region inserted together with its
                text is often not read). The hint is not in it: focus moves
                to continue, which is described by the hint text. */}
            <div
              id="steam-signin-status"
              data-testid="steam-signin-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              // stays displayed when empty (so it is announced reliably);
              // steam-signin.css cancels the grid gap it adds (empty:-mb-2)
            >
              <Switch>
                <Match when={state().kind === "resuming"}>
                  <p data-testid="steam-signin-resuming">
                    {STEAM_RESUMING_TEXT}
                  </p>
                </Match>
                <Match when={state().kind === "deleting"}>
                  <p
                    id="steam-delete-pending"
                    data-testid="steam-delete-pending"
                    tabIndex={-1}
                  >
                    {STEAM_DELETE_TEXT.pending}
                  </p>
                </Match>
                <Match
                  when={(() => {
                    const s = state();
                    return s.kind === "signedOut" ? s.notice : undefined;
                  })()}
                >
                  {(notice) => (
                    <p data-testid="steam-delete-notice">
                      {notice() === "deleted"
                        ? STEAM_DELETE_TEXT.done
                        : STEAM_DELETE_TEXT.expired}
                    </p>
                  )}
                </Match>
                <Match when={state().kind === "pending"}>
                  <p
                    id="steam-signin-pending"
                    data-testid="steam-signin-pending"
                    tabIndex={-1}
                  >
                    Waiting for Steam in your browser...
                  </p>
                </Match>
                <Match when={state().kind === "signedIn"}>
                  <Show
                    when={(() => {
                      const s = state();
                      return s.kind === "signedIn" && s.deleteError;
                    })()}
                  >
                    <p data-testid="steam-delete-error">
                      {STEAM_DELETE_TEXT.network}
                    </p>
                  </Show>
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
                </Match>
                <Match when={errorOf(state())}>
                  {(error) => (
                    <p data-testid="steam-signin-error">
                      {STEAM_SIGNIN_ERROR_TEXT[error()]}
                    </p>
                  )}
                </Match>
              </Switch>
            </div>
            <Switch>
              <Match when={state().kind === "hint"}>
                <div data-testid="steam-signin-hint" class="grid gap-2">
                  <p id="steam-signin-hint-text">{STEAM_SIGNIN_HINT}</p>
                  <div class="grid grid-cols-2 gap-2">
                    <Button
                      id="steam-signin-continue"
                      onClick={() => void proceed()}
                      text="continue"
                      // Button spreads dataset onto the element; used so the
                      // shared Button (web output) stays unchanged.
                      dataset={{ "aria-describedby": "steam-signin-hint-text" }}
                    />
                    <Button
                      id="steam-signin-back"
                      onClick={backToSignedOut}
                      text="cancel"
                    />
                  </div>
                </div>
              </Match>
              <Match
                when={
                  state().kind === "pending" ||
                  state().kind === "resuming" ||
                  state().kind === "deleting"
                }
              >
                {null}
              </Match>
              <Match when={state().kind === "confirmDelete"}>
                <div
                  data-testid="steam-delete-confirm"
                  class="grid gap-2"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelDelete();
                    }
                  }}
                >
                  <p id="steam-delete-confirm-text">
                    {STEAM_DELETE_TEXT.confirm}
                  </p>
                  <div class="grid gap-2">
                    <Button
                      id="steam-delete-confirm"
                      onClick={() => void confirmDelete()}
                      text={STEAM_DELETE_TEXT.confirmButton}
                      dataset={{
                        "aria-describedby": "steam-delete-confirm-text",
                      }}
                    />
                    <Button
                      id="steam-delete-cancel"
                      onClick={cancelDelete}
                      text={STEAM_DELETE_TEXT.cancel}
                      dataset={{
                        "aria-describedby": "steam-delete-confirm-text",
                      }}
                    />
                  </div>
                </div>
              </Match>
              <Match when={state().kind === "signedIn"}>
                <div class="grid gap-2">
                  <Button
                    id="steam-signout"
                    onClick={signOut}
                    text="sign out"
                  />
                  <Show when={canDelete()}>
                    <Button
                      id="steam-delete-button"
                      onClick={askDelete}
                      text={STEAM_DELETE_TEXT.button}
                    />
                  </Show>
                </div>
              </Match>
              <Match when={true}>
                <Button
                  id="steam-signin-button"
                  onClick={openHint}
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
