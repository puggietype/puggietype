import { createForm } from "@tanstack/solid-form";
import { createSignal, JSXElement, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import { H3 } from "../../components/common/Headers";
import { InputField } from "../../components/ui/form/InputField";
import { SubmitButton } from "../../components/ui/form/SubmitButton";
import { allFieldsMandatory } from "../../components/ui/form/utils";
import { showErrorNotification } from "../../states/notifications";
import { requestPasswordReset } from "../session";
import { accountsCopy } from "../strings";

/**
 * Firebase password reset email. No Turnstile (Legal M2): the request goes
 * straight to Firebase with the public API key, so a token here was never
 * verified anywhere. Firebase's own rate limits and email quotas apply (see
 * DEPLOY.md "Abuse controls"). Same "sent" text whether or not the account
 * exists.
 */
export function ResetPasswordForm(props: { onBack: () => void }): JSXElement {
  const [busy, setBusy] = createSignal(false);
  const [sent, setSent] = createSignal(false);

  const form = createForm(() => ({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      if (busy()) return;
      setBusy(true);
      try {
        const result = await requestPasswordReset(value.email);
        if (result.ok) setSent(true);
        else showErrorNotification(result.message);
      } finally {
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
          <SubmitButton
            form={form}
            fa={{ icon: "fa-paper-plane" }}
            text={accountsCopy.reset.submit}
            disabled={busy()}
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
