import { createSignal, JSXElement, onCleanup } from "solid-js";

import { Button } from "../../components/common/Button";
import {
  showErrorNotification,
  showNoticeNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { refreshVerification, resendVerification } from "../session";
import { accountsCopy } from "../strings";

// Firebase rate-limits verification emails; don't let the button spam it
export const RESEND_COOLDOWN_MS = 60_000;

/** "verify your email" for a signed-in, unverified account */
export function VerifyEmailNotice(): JSXElement {
  const [busy, setBusy] = createSignal(false);
  const [coolingDown, setCoolingDown] = createSignal(false);
  let cooldown: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(cooldown));

  const resend = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await resendVerification();
      if (!result.ok) {
        showErrorNotification(result.message);
        return;
      }
      showSuccessNotification(accountsCopy.verify.resent);
      setCoolingDown(true);
      cooldown = setTimeout(() => setCoolingDown(false), RESEND_COOLDOWN_MS);
    } finally {
      setBusy(false);
    }
  };

  const check = async (): Promise<void> => {
    setBusy(true);
    try {
      if (await refreshVerification()) {
        showSuccessNotification(accountsCopy.verify.verified);
      } else {
        showNoticeNotification(accountsCopy.verify.stillUnverified);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="grid gap-2">
      <p class="text-sub">{accountsCopy.verify.notice}</p>
      <Button
        text={accountsCopy.verify.resend}
        fa={{ icon: "fa-envelope" }}
        onClick={() => void resend()}
        disabled={busy() || coolingDown()}
      />
      <Button
        variant="text"
        text={accountsCopy.verify.check}
        onClick={() => void check()}
        disabled={busy()}
      />
    </div>
  );
}
