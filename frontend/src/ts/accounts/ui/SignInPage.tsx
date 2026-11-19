import {
  createSignal,
  JSXElement,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";

import { Button } from "../../components/common/Button";
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { isAgeBlocked } from "../age";
import { AGE_BLOCKED, AuthResult, preloadSdk } from "../session";
import { getAccountUser } from "../state";
import { accountsCopy } from "../strings";
import { AgeCheckPrompt } from "./AgeCheckPrompt";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { SignedInPanel } from "./SignedInPanel";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";

type Mode = "signIn" | "signUp" | "reset" | "age";

/** accounts milestone A (VITE_FEATURE_ACCOUNTS) /login, replaces LoginPage */
export function SignInPage(): JSXElement {
  const [mode, setMode] = createSignal<Mode>("signIn");
  const [ageBlocked, setAgeBlocked] = createSignal(isAgeBlocked(localStorage));

  const onResult = (result: AuthResult): void => {
    if (result.status === "signed-in") {
      setMode("signIn");
      showSuccessNotification(
        result.created
          ? accountsCopy.signUp.success
          : accountsCopy.signIn.success,
      );
    } else if (result.status === "needs-age") {
      setMode("age");
    } else {
      if (result.code === AGE_BLOCKED) {
        setAgeBlocked(true);
        setMode("signUp");
      } else if (mode() === "age") {
        setMode("signIn");
      }
      if (result.code !== AGE_BLOCKED) showErrorNotification(result.message);
    }
  };

  // the Google popup must open within the click, so fetch Firebase now
  onMount(() => preloadSdk());

  const tab = (target: "signIn" | "signUp", text: string): JSXElement => (
    <Button
      variant="text"
      text={text}
      active={mode() === target}
      ariaPressed={mode() === target}
      onClick={() => setMode(target)}
    />
  );

  return (
    <div class="grid h-full place-items-center">
      <div class="grid w-full grid-cols-1 gap-2 sm:w-80">
        <Show
          when={getAccountUser()}
          fallback={
            <Switch>
              <Match when={mode() === "age"}>
                <AgeCheckPrompt
                  onResult={onResult}
                  onCancel={() => setMode("signIn")}
                />
              </Match>
              <Match when={mode() === "reset"}>
                <ResetPasswordForm onBack={() => setMode("signIn")} />
              </Match>
              <Match when={mode() === "signIn" || mode() === "signUp"}>
                <div class="flex justify-center gap-2">
                  {tab("signIn", accountsCopy.tabs.signIn)}
                  {tab("signUp", accountsCopy.tabs.signUp)}
                </div>
                <Switch>
                  <Match when={mode() === "signIn"}>
                    <SignInForm
                      onResult={onResult}
                      onForgotPassword={() => setMode("reset")}
                    />
                  </Match>
                  <Match when={ageBlocked()}>
                    <p class="text-sub">{accountsCopy.age.blocked}</p>
                  </Match>
                  <Match when={mode() === "signUp"}>
                    <SignUpForm
                      onResult={onResult}
                      onBlocked={() => setAgeBlocked(true)}
                    />
                  </Match>
                </Switch>
              </Match>
            </Switch>
          }
        >
          {(user) => <SignedInPanel user={user()} />}
        </Show>
      </div>
    </div>
  );
}
