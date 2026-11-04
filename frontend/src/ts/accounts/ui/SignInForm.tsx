import { createForm } from "@tanstack/solid-form";
import { createSignal, JSXElement } from "solid-js";

import { Button } from "../../components/common/Button";
import { H3 } from "../../components/common/Headers";
import { Separator } from "../../components/common/Separator";
import { InputField } from "../../components/ui/form/InputField";
import { SubmitButton } from "../../components/ui/form/SubmitButton";
import { allFieldsMandatory } from "../../components/ui/form/utils";
import { getAccountsConfig } from "../config";
import { AuthMethod, AuthResult, signIn } from "../session";
import { accountsCopy } from "../strings";
import { TurnstileControl, TurnstileWidget } from "./TurnstileWidget";

/** email/password or Google sign-in to an existing account */
export function SignInForm(props: {
  onResult: (result: AuthResult) => void;
  onForgotPassword: () => void;
}): JSXElement {
  const config = getAccountsConfig();
  const [turnstileToken, setTurnstileToken] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  let turnstile: TurnstileControl | undefined;

  const canSubmit = (): boolean => !busy() && turnstileToken() !== null;

  const trySignIn = async (method: AuthMethod): Promise<void> => {
    const token = turnstileToken();
    if (token === null || busy()) return;
    setBusy(true);
    try {
      props.onResult(await signIn(method, token));
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

  return (
    <div class="grid w-full grid-cols-1 gap-2">
      <H3
        text={accountsCopy.signIn.title}
        fa={{ icon: "fa-sign-in-alt" }}
        class="p-0"
      />
      <Button
        text={accountsCopy.signIn.google}
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
        <Separator text={accountsCopy.signIn.or} />
        <form.Field
          name="email"
          children={(field) => (
            <InputField
              field={field}
              placeholder={accountsCopy.signIn.email}
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
              placeholder={accountsCopy.signIn.password}
              type="password"
              autocomplete="current-password"
              disabled={busy()}
            />
          )}
        />
        <TurnstileWidget
          siteKey={config.turnstileSiteKey}
          action="session"
          onToken={setTurnstileToken}
          control={(c) => (turnstile = c)}
        />
        <SubmitButton
          form={form}
          fa={{ icon: "fa-sign-in-alt" }}
          text={accountsCopy.signIn.submit}
          disabled={!canSubmit()}
        />
      </form>
      <Button
        variant="text"
        text={accountsCopy.reset.link}
        onClick={() => props.onForgotPassword()}
      />
    </div>
  );
}
