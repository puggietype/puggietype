import {
  createSignal,
  JSXElement,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";

import { Button } from "../../components/common/Button";
import { H3 } from "../../components/common/Headers";
import { takeActionLink } from "../action-link";
import { isPasswordOk } from "../password";
import {
  ActionCodeResult,
  applyRecoverEmailLink,
  applyVerifyEmailLink,
  checkResetLink,
  finishPasswordReset,
  LINK_INVALID,
} from "../session";
import { accountsCopy } from "../strings";
import { RESET_LOGIN_PATH } from "./reset-query";
import { ResetPasswordForm } from "./ResetPasswordForm";

type View =
  | { kind: "checking" }
  | { kind: "resetForm" }
  | { kind: "done"; message: string; offerReset?: boolean }
  | { kind: "failed"; message: string; canRequestReset: boolean }
  | { kind: "requestReset" };

const copy = accountsCopy.action;
const inputClass =
  "w-full rounded border-none bg-sub-alt p-[0.5em] text-em-base text-text caret-main outline-none focus-visible:shadow-[0_0_0_0.1rem_var(--bg-color),0_0_0_0.2rem_var(--text-color)]";
const linkClass = "text-sub underline hover:text-text";

function SignInLink(): JSXElement {
  return (
    <a class={linkClass} href="/login" router-link>
      {copy.toSignIn}
    </a>
  );
}

/** /login opened on the reset form (SignInPage reads ?reset=1 once) */
function ResetPasswordLink(): JSXElement {
  return (
    <a class={linkClass} href={RESET_LOGIN_PATH} router-link>
      {copy.resetPassword}
    </a>
  );
}

/** /account/action (VITE_FEATURE_ACCOUNTS): handles Firebase email links */
export function AccountActionPage(): JSXElement {
  const [view, setView] = createSignal<View>({ kind: "checking" });
  const [password, setPassword] = createSignal("");
  const [confirm, setConfirm] = createSignal("");
  const [formError, setFormError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  // the oobCode lives only in this closure
  const link = takeActionLink();
  const code = link?.oobCode ?? "";

  const doneView = (): Extract<View, { kind: "done" }> | undefined => {
    const v = view();
    return v.kind === "done" ? v : undefined;
  };
  const failedView = (): Extract<View, { kind: "failed" }> | undefined => {
    const v = view();
    return v.kind === "failed" ? v : undefined;
  };

  const failed = (result: ActionCodeResult, isReset: boolean): void => {
    if (result.ok) return;
    setView({
      kind: "failed",
      message: result.message,
      canRequestReset: isReset && result.code === LINK_INVALID,
    });
  };

  const finish = (
    result: ActionCodeResult,
    message: string,
    isReset: boolean,
    offerReset = false,
  ): void => {
    if (result.ok) setView({ kind: "done", message, offerReset });
    else failed(result, isReset);
  };

  onMount(() => {
    const mode = link?.mode ?? "";
    const known = ["resetPassword", "verifyEmail", "recoverEmail"];
    if (code === "" || !known.includes(mode)) {
      setView({
        kind: "failed",
        message: copy.notValid,
        canRequestReset: false,
      });
      return;
    }
    void (async () => {
      if (mode === "resetPassword") {
        const result = await checkResetLink(code);
        if (result.ok) setView({ kind: "resetForm" });
        else failed(result, true);
      } else if (mode === "verifyEmail") {
        finish(await applyVerifyEmailLink(code), copy.verifyDone, false);
      } else {
        // someone else may have changed it: offer the reset right here
        finish(
          await applyRecoverEmailLink(code),
          copy.recoverDone,
          false,
          true,
        );
      }
    })();
  });

  const submitReset = async (): Promise<void> => {
    if (busy()) return;
    if (!isPasswordOk(password())) {
      setFormError(copy.passwordRule);
      return;
    }
    if (password() !== confirm()) {
      setFormError(copy.mismatch);
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const result = await finishPasswordReset(code, password());
      if (result.ok) {
        setView({ kind: "done", message: copy.resetDone });
      } else if (result.code === LINK_INVALID) {
        failed(result, true);
      } else {
        setFormError(result.message);
      }
    } finally {
      setPassword("");
      setConfirm("");
      setBusy(false);
    }
  };

  return (
    <div class="grid h-full place-items-center">
      <div class="grid w-full grid-cols-1 gap-2 sm:w-80">
        <Switch>
          <Match when={view().kind === "requestReset"}>
            <ResetPasswordForm
              onBack={() =>
                setView({
                  kind: "failed",
                  message: copy.linkInvalid,
                  canRequestReset: true,
                })
              }
            />
          </Match>
          <Match when={view().kind === "resetForm"}>
            <H3 text={copy.resetTitle} fa={{ icon: "fa-key" }} class="p-0" />
            <form
              class="grid w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void submitReset();
              }}
            >
              <p class="text-sm text-sub">{copy.passwordRule}</p>
              <label class="grid gap-1 text-left text-sm text-sub">
                {copy.newPassword}
                <input
                  type="password"
                  name="new-password"
                  autocomplete="new-password"
                  class={inputClass}
                  value={password()}
                  disabled={busy()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                />
              </label>
              <label class="grid gap-1 text-left text-sm text-sub">
                {copy.confirmPassword}
                <input
                  type="password"
                  name="confirm-password"
                  autocomplete="new-password"
                  class={inputClass}
                  value={confirm()}
                  disabled={busy()}
                  onInput={(e) => setConfirm(e.currentTarget.value)}
                />
              </label>
              <Show when={formError()}>
                {(message) => (
                  <p class="text-error" role="alert">
                    {message()}
                  </p>
                )}
              </Show>
              <Button
                type="submit"
                text={copy.resetSubmit}
                fa={{ icon: "fa-save" }}
                disabled={busy()}
              />
            </form>
          </Match>
          <Match when={doneView()}>
            {(v) => (
              <>
                <H3 text={copy.title} fa={{ icon: "fa-user" }} class="p-0" />
                <p>{v().message}</p>
                <div class="flex flex-wrap gap-4">
                  <SignInLink />
                  <Show when={v().offerReset === true}>
                    <ResetPasswordLink />
                  </Show>
                </div>
              </>
            )}
          </Match>
          <Match when={failedView()}>
            {(v) => (
              <>
                <H3 text={copy.title} fa={{ icon: "fa-user" }} class="p-0" />
                <p role="alert">{v().message}</p>
                <Show when={v().canRequestReset}>
                  <Button
                    text={copy.requestNewReset}
                    fa={{ icon: "fa-paper-plane" }}
                    onClick={() => setView({ kind: "requestReset" })}
                  />
                </Show>
                <SignInLink />
              </>
            )}
          </Match>
          <Match when={view().kind === "checking"}>
            <p class="text-sub">{copy.checking}</p>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
