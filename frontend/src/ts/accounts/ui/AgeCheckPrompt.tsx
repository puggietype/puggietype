import { createSignal, JSXElement } from "solid-js";

import { Button } from "../../components/common/Button";
import { isAgeOk } from "../age";
import { getAccountsConfig } from "../config";
import { AuthResult, cancelAgeCheck, completeAgeCheck } from "../session";
import { accountsCopy } from "../strings";
import { BirthYearField } from "./BirthYearField";
import { TurnstileControl, TurnstileWidget } from "./TurnstileWidget";

/**
 * The API wants the age answer for a new account (a first Google sign-in):
 * same neutral question, a fresh Turnstile token, then the session retry.
 */
export function AgeCheckPrompt(props: {
  onResult: (result: AuthResult) => void;
  onCancel: () => void;
}): JSXElement {
  const config = getAccountsConfig();
  const [birthYear, setBirthYear] = createSignal<number | null>(null);
  const [turnstileToken, setTurnstileToken] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  let turnstile: TurnstileControl | undefined;

  const canSubmit = (): boolean =>
    !busy() && birthYear() !== null && turnstileToken() !== null;

  const submit = async (): Promise<void> => {
    const year = birthYear();
    const token = turnstileToken();
    if (year === null || token === null || busy()) return;
    const ageOk = isAgeOk(year, new Date());
    setBirthYear(null);
    setBusy(true);
    try {
      props.onResult(await completeAgeCheck(ageOk, token));
    } finally {
      turnstile?.reset();
      setBusy(false);
    }
  };

  const cancel = async (): Promise<void> => {
    setBusy(true);
    try {
      await cancelAgeCheck();
    } finally {
      setBusy(false);
      props.onCancel();
    }
  };

  return (
    <div class="grid w-full grid-cols-1 gap-2">
      <p class="text-sub">{accountsCopy.age.prompt}</p>
      <BirthYearField
        value={birthYear()}
        onChange={setBirthYear}
        disabled={busy()}
      />
      <TurnstileWidget
        siteKey={config.turnstileSiteKey}
        action="session"
        onToken={setTurnstileToken}
        control={(c) => (turnstile = c)}
      />
      <Button
        text={accountsCopy.age.continue}
        onClick={() => void submit()}
        disabled={!canSubmit()}
      />
      <Button
        variant="text"
        text={accountsCopy.age.cancel}
        onClick={() => void cancel()}
        disabled={busy()}
      />
    </div>
  );
}
