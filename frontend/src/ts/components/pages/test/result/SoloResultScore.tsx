import { createMemo, JSXElement, Show } from "solid-js";

import { isAgeConfirmed } from "../../../../multiplayer/age-gate";
import {
  SoloLeaderboardSubmit,
  type SoloSubmitAvailability,
} from "../../../../multiplayer/components/SoloLeaderboardSubmit";
import { MULTIPLAYER_ENABLED } from "../../../../multiplayer/flags";
import {
  leaderboardSubmitBlocked,
  scoreFromResult,
} from "../../../../multiplayer/leaderboards";
import {
  connectionStatus,
  leaderboardsOn,
  serverFeatures,
} from "../../../../multiplayer/store";

export function InGameLeaderboard(props: {
  result: Parameters<typeof scoreFromResult>[0];
  invalid: boolean;
}): JSXElement {
  const score = createMemo(() => scoreFromResult(props.result));
  const kids = (): boolean =>
    leaderboardSubmitBlocked(
      window.location.pathname,
      document.referrer,
      sessionStorage,
    );
  const availability = (): SoloSubmitAvailability | "hidden" => {
    if (leaderboardsOn()) return "on";
    // Same 13+ gate as before: the client only learns that ranks are on
    // after the existing confirmation. No separate solo age prompt.
    if (!MULTIPLAYER_ENABLED || !isAgeConfirmed()) return "hidden";
    if (serverFeatures() === undefined) return "checking";
    if (
      connectionStatus() === "connecting" ||
      connectionStatus() === "reconnecting"
    ) {
      return "checking";
    }
    return "off";
  };
  const shown = (): SoloSubmitAvailability | undefined => {
    const next = availability();
    return next === "hidden" ? undefined : next;
  };
  // Show only toggles on truthiness. Passing the status string as `when`
  // freezes the first truthy value, so "checking" never becomes "on".
  return (
    <Show when={shown() !== undefined}>
      <SoloLeaderboardSubmit
        score={score()}
        invalid={props.invalid}
        kids={kids()}
        availability={shown() ?? "off"}
      />
    </Show>
  );
}
