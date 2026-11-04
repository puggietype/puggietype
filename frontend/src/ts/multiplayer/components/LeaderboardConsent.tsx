import { createSignal, JSXElement, onCleanup, onMount, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import { cn } from "../../utils/cn";
import { setShowOnLeaderboard, showOnLeaderboard } from "../leaderboard-pref";
import { SCORE_CONSENT_MS } from "../leaderboards";
import { PRIMARY_BUTTON } from "./ui";

/** results-screen choice, shown before a score is submitted */
export function LeaderboardConsent(props: {
  wpm?: number;
  disabled?: boolean;
  message?: string;
  onSubmit: (show: boolean) => void;
}): JSXElement {
  const [unlocked, setUnlocked] = createSignal(false);
  onMount(() => {
    const timer = setTimeout(() => setUnlocked(true), SCORE_CONSENT_MS);
    onCleanup(() => clearTimeout(timer));
  });
  const locked = (): boolean => props.disabled === true || !unlocked();
  return (
    <form
      class="grid gap-3 rounded-lg bg-sub-alt p-4"
      data-testid="lb-consent"
      aria-label="Submit your score"
      onSubmit={(e) => {
        e.preventDefault();
        if (locked()) return;
        props.onSubmit(showOnLeaderboard());
      }}
    >
      <Show when={props.wpm !== undefined}>
        <div class="text-sm text-sub">
          you finished · {Math.round(props.wpm ?? 0)} wpm
        </div>
      </Show>
      <label class="flex cursor-pointer items-center gap-3 text-text">
        <input
          type="checkbox"
          name="showOnLeaderboard"
          class="size-4 shrink-0 accent-main"
          data-testid="lb-show-score"
          checked={showOnLeaderboard()}
          disabled={props.disabled}
          onChange={(e) => setShowOnLeaderboard(e.currentTarget.checked)}
        />
        Show my score on the leaderboard
      </label>
      <p class="text-sm text-sub">
        Uncheck to keep this score off the public leaderboard. Your random
        nickname, wpm, accuracy and raw speed are what gets saved.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          text={props.disabled ? "Submitting…" : "Submit score"}
          fa={{ icon: "fa-crown" }}
          class={cn(PRIMARY_BUTTON, "px-5 py-3")}
          disabled={locked()}
          dataset={{ "data-testid": "lb-submit" }}
        />
        <Show when={props.message}>
          <p
            class="text-sm text-sub"
            role="status"
            data-testid="lb-submit-status"
          >
            {props.message}
          </p>
        </Show>
      </div>
    </form>
  );
}
