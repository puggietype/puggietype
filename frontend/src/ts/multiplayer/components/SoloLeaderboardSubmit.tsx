import { createSignal, JSXElement, onCleanup } from "solid-js";

import { readStoredSession } from "../client";
import { showOnLeaderboard } from "../leaderboard-pref";
import {
  currentLeaderboardBase,
  leaderboardSubmitBlocked,
  postLeaderboardScore,
  type ScoreSubmission,
} from "../leaderboards";
import { LeaderboardConsent } from "./LeaderboardConsent";

type SoloScore = Omit<
  ScoreSubmission,
  "showOnLeaderboard" | "playerId" | "sessionToken"
>;

function submitBlocked(): boolean {
  return leaderboardSubmitBlocked(
    window.location.pathname,
    document.referrer,
    sessionStorage,
  );
}

/**
 * Solo results: the toggle is on screen before the POST. Next test (unmount)
 * submits too, so leaving the result still sends the choice they saw.
 */
export function SoloLeaderboardSubmit(props: { score: SoloScore }): JSXElement {
  const [sent, setSent] = createSignal(false);
  const [message, setMessage] = createSignal<string | undefined>();
  let finished = false;

  const send = (show: boolean): void => {
    if (finished || submitBlocked()) {
      finished = true;
      return;
    }
    finished = true;
    setSent(true);
    const session = readStoredSession();
    void postLeaderboardScore(currentLeaderboardBase(), {
      ...props.score,
      showOnLeaderboard: show,
      ...(session ?? {}),
    }).then((result) => {
      setMessage(result.ok ? "Score submitted." : result.error);
    });
  };

  onCleanup(() => {
    if (!finished) send(showOnLeaderboard());
  });

  return (
    <LeaderboardConsent disabled={sent()} message={message()} onSubmit={send} />
  );
}
