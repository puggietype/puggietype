import { createForm } from "@tanstack/solid-form";
import { createSignal, JSXElement } from "solid-js";

import { Button } from "../../components/common/Button";
import { H3 } from "../../components/common/Headers";
import { Separator } from "../../components/common/Separator";
import { InputField } from "../../components/ui/form/InputField";
import { SubmitButton } from "../../components/ui/form/SubmitButton";
import { allFieldsMandatory } from "../../components/ui/form/utils";
import { blockAge, isAgeOk } from "../age";
import { getAccountsConfig } from "../config";
import { AuthMethod, AuthResult, signUp } from "../session";
import { accountsCopy } from "../strings";
import { BirthYearField } from "./BirthYearField";
import { TurnstileControl, TurnstileWidget } from "./TurnstileWidget";

/**
 * Email/password or Google sign-up with the neutral birth-year question.
 * The year is checked here and dropped: only "13 or older" moves on.
 */
export function SignUpForm(props: {
  onResult: (result: AuthResult) => void;
  onBlocked: () => void;
}): JSXElement {
  const config = getAccountsConfig();
  const [birthYear, setBirthYear] = createSignal<number | null>(null);
  const [turnstileToken, setTurnstileToken] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  let turnstile: TurnstileControl | undefined;

  const canSubmit = (): boolean =>
    !busy() && birthYear() !== null && turnstileToken() !== null;

  const trySignUp = async (method: AuthMethod): Promise<void> => {
    const year = birthYear();
    const token = turnstileToken();
    if (year === null || token === null || busy()) return;
    const ageOk = isAgeOk(year, new Date());
    setBirthYear(null);
    if (!ageOk) {
      blockAge(sessionStorage);
      props.onBlocked();
      return;
    }
    setBusy(true);
    try {
      props.onResult(await signUp(method, token));
    } finally {
      // the token was spent either way
      turnstile?.reset();
      setBusy(false);
    }
  };

  const form = createForm(() => ({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) =>
      trySignUp({
        kind: "email",
        email: value.email,
        password: value.password,
      }),
    validators: { onChange: allFieldsMandatory() },
  }));

  return (
    <div class="grid w-full grid-cols-1 gap-2">
      <H3
        text={accountsCopy.signUp.title}
        fa={{ icon: "fa-user-plus" }}
        class="p-0"
      />
      <BirthYearField
        value={birthYear()}
        onChange={setBirthYear}
        disabled={busy()}
      />
      <Button
        text={accountsCopy.signUp.google}
        fa={{ icon: "fa-google", variant: "brand" }}
        onClick={() => void trySignUp({ kind: "google" })}
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
              autocomplete="new-password"
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
          fa={{ icon: "fa-user-plus" }}
          text={accountsCopy.signUp.submit}
          disabled={!canSubmit()}
        />
      </form>
    </div>
  );
}
