import { createResource, createSignal, JSXElement, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { deleteAccount, getReauthKind } from "../session";
import { accountsCopy } from "../strings";

/** delete account behind a confirm step that re-authenticates */
export function DeleteAccount(): JSXElement {
  const [confirming, setConfirming] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [password, setPassword] = createSignal("");
  const [kind] = createResource(confirming, async () => getReauthKind());

  const canConfirm = (): boolean =>
    !busy() &&
    (kind() === "google" || (kind() === "password" && password() !== ""));

  const confirm = async (): Promise<void> => {
    if (!canConfirm()) return;
    setBusy(true);
    try {
      const result = await deleteAccount(
        kind() === "password" ? password() : undefined,
      );
      if (result.ok) showSuccessNotification(accountsCopy.account.deleted);
      else showErrorNotification(result.message);
    } finally {
      setPassword("");
      setBusy(false);
    }
  };

  const cancel = (): void => {
    setPassword("");
    setConfirming(false);
  };

  return (
    <Show
      when={confirming()}
      fallback={
        <Button
          variant="text"
          text={accountsCopy.account.delete}
          fa={{ icon: "fa-trash" }}
          danger
          onClick={() => setConfirming(true)}
        />
      }
    >
      <div
        class="grid gap-2"
        role="group"
        aria-label={accountsCopy.account.delete}
      >
        <p class="text-error">{accountsCopy.account.warning}</p>
        <Show when={kind() === "password"}>
          <label class="grid gap-1 text-left text-sm text-sub">
            {accountsCopy.account.confirmPassword}
            <input
              type="password"
              name="current-password"
              autocomplete="current-password"
              class="w-full rounded border-none bg-sub-alt p-[0.5em] text-em-base text-text caret-main outline-none focus-visible:shadow-[0_0_0_0.1rem_var(--bg-color),0_0_0_0.2rem_var(--text-color)]"
              value={password()}
              disabled={busy()}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
        </Show>
        <Show when={kind() === "google"}>
          <p class="text-sm text-sub">{accountsCopy.account.confirmGoogle}</p>
        </Show>
        <Button
          text={accountsCopy.account.confirm}
          fa={{ icon: "fa-trash" }}
          danger
          onClick={() => void confirm()}
          disabled={!canConfirm()}
        />
        <Button
          variant="text"
          text={accountsCopy.account.cancel}
          onClick={cancel}
          disabled={busy()}
        />
      </div>
    </Show>
  );
}
