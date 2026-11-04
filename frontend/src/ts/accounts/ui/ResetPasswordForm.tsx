import { createForm } from "@tanstack/solid-form";
import { createSignal, JSXElement, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import { H3 } from "../../components/common/Headers";
import { InputField } from "../../components/ui/form/InputField";
import { SubmitButton } from "../../components/ui/form/SubmitButton";
import { allFieldsMandatory } from "../../components/ui/form/utils";
import { showErrorNotification } from "../../states/notifications";
import { getAccountsConfig } from "../config";
import { requestPasswordReset } from "../session";
import { accountsCopy } from "../strings";
import { TurnstileControl, TurnstileWidget } from "./TurnstileWidget";

/** Firebase password reset email, behind Turnstile */
export function ResetPasswordForm(props: { onBack: () => void }): JSXElement {
  const config = getAccountsConfig();
  const [turnstileToken, setTurnstileToken] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [sent, setSent] = createSignal(false);
  let turnstile: TurnstileControl | undefined;

  const form = createForm(() => ({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      if (turnstileToken() === null || busy()) return;
      setBusy(true);
      try {
        const result = await requestPasswordReset(value.email);
        if (result.ok) setSent(true);
        else showErrorNotification(result.message);
      } finally {
        turnstile?.reset();
        setBusy(false);
      }
    },
    validators: { onChange: allFieldsMandatory() },
  }));

  return (
    <div class="grid w-full grid-cols-1 gap-2">
      <H3 text={accountsCopy.reset.title} fa={{ icon: "fa-key" }} class="p-0" />
      <Show
        when={!sent()}
        fallback={<p class="text-sub">{accountsCopy.reset.sent}</p>}
      >
        <form
          class="grid w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
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
          <TurnstileWidget
            siteKey={config.turnstileSiteKey}
            action="reset"
            onToken={setTurnstileToken}
            control={(c) => (turnstile = c)}
          />
          <SubmitButton
            form={form}
            fa={{ icon: "fa-paper-plane" }}
            text={accountsCopy.reset.submit}
            disabled={busy() || turnstileToken() === null}
          />
        </form>
      </Show>
      <Button
        variant="text"
        text={accountsCopy.reset.back}
        onClick={() => props.onBack()}
      />
    </div>
  );
}
