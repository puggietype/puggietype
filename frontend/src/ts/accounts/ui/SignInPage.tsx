import { createForm } from "@tanstack/solid-form";
import { createSignal, JSXElement, onMount, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import { H3 } from "../../components/common/Headers";
import { Separator } from "../../components/common/Separator";
import { InputField } from "../../components/ui/form/InputField";
import { SubmitButton } from "../../components/ui/form/SubmitButton";
import { allFieldsMandatory } from "../../components/ui/form/utils";
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { getAccountsConfig } from "../config";
import { preloadSdk, signIn, SignInMethod, signOut } from "../session";
import { getAccountUser } from "../state";
import { TurnstileControl, TurnstileWidget } from "./TurnstileWidget";

/** accounts milestone A sign-in (VITE_FEATURE_ACCOUNTS), replaces LoginPage */
export function SignInPage(): JSXElement {
  const config = getAccountsConfig();
  const [turnstileToken, setTurnstileToken] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  let turnstile: TurnstileControl | undefined;

  const canSubmit = (): boolean => !busy() && turnstileToken() !== null;

  const trySignIn = async (method: SignInMethod): Promise<void> => {
    const token = turnstileToken();
    if (token === null || busy()) return;
    setBusy(true);
    try {
      const result = await signIn(method, token);
      if (result.ok) showSuccessNotification("Signed in");
      else showErrorNotification(result.message);
    } finally {
      // the token was spent either way
      turnstile?.reset();
      setBusy(false);
    }
  };

  const form = createForm(() => ({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) =>
      trySignIn({
        kind: "email",
        email: value.email,
        password: value.password,
      }),
    validators: { onChange: allFieldsMandatory() },
  }));

  // the Google popup must open within the click, so fetch Firebase now
  onMount(() => preloadSdk());

  return (
    <div class="grid h-full place-items-center">
      <Show
        when={getAccountUser()}
        fallback={
          <div class="grid w-full grid-cols-1 gap-2 sm:w-80">
            <H3 text="sign in" fa={{ icon: "fa-sign-in-alt" }} class="p-0" />
            <Button
              text="google"
              fa={{ icon: "fa-google", variant: "brand" }}
              onClick={() => void trySignIn({ kind: "google" })}
              disabled={!canSubmit()}
            />
            <form
              class="grid w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <Separator text="or" />
              <form.Field
                name="email"
                children={(field) => (
                  <InputField
                    field={field}
                    placeholder="email"
                    autocomplete="email"
                    disabled={busy()}
                  />
                )}
              />
              <form.Field
                name="password"
                children={(field) => (
                  <InputField
                    field={field}
                    placeholder="password"
                    type="password"
                    autocomplete="current-password"
                    disabled={busy()}
                  />
                )}
              />
              <TurnstileWidget
                siteKey={config.turnstileSiteKey}
                action="signin"
                onToken={setTurnstileToken}
                control={(c) => (turnstile = c)}
              />
              <SubmitButton
                form={form}
                fa={{ icon: "fa-sign-in-alt" }}
                text="sign in"
                disabled={!canSubmit()}
              />
            </form>
          </div>
        }
      >
        {(user) => (
          <div class="grid w-full grid-cols-1 gap-2 sm:w-80">
            <H3 text="signed in" fa={{ icon: "fa-user" }} class="p-0" />
            <Show when={!user().emailVerified}>
              <p class="text-sub">Your email is not verified yet.</p>
            </Show>
            <Button
              text="sign out"
              fa={{ icon: "fa-sign-out-alt" }}
              onClick={() => void signOut()}
            />
          </div>
        )}
      </Show>
    </div>
  );
}
