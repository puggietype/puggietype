import { createSignal, JSXElement, onCleanup, onMount } from "solid-js";

import { readStoredSession } from "../client";
import { readShowOnLeaderboard } from "../leaderboard-pref";
import {
  currentLeaderboardBase,
  leaderboardSubmitBlocked,
  postLeaderboardScore,
  registerSoloSubmit,
  scoreConsentElapsed,
  type ScoreSubmission,
} from "../leaderboards";
import { LeaderboardConsent } from "./LeaderboardConsent";

type SoloScore = Omit<ScoreSubmission, "showOnLeaderboard" | "sessionToken">;

function submitBlocked(): boolean {
  return leaderboardSubmitBlocked(
    window.location.pathname,
    document.referrer,
    sessionStorage,
  );
}

/**
 * Solo results. A score is posted only from Next, Retry, or Submit score,
 * and only after this toggle has been visible for 2 seconds. Leaving the
 * page drops the score. Submit stays disabled for the first 2 seconds, and
 * an early Next or Retry does not use up the later submit.
 */
export function SoloLeaderboardSubmit(props: {
  score: SoloScore;
  /** tests inject a clock; production uses Date.now */
  now?: () => number;
}): JSXElement {
  const [sent, setSent] = createSignal(false);
  const [message, setMessage] = createSignal<string | undefined>();
  const clock = (): number => props.now?.() ?? Date.now();
  // Infinity until mount, so a click before the toggle is shown cannot send
  let shownAt = Number.POSITIVE_INFINITY;
  let finished = false;

  const send = (show: boolean): void => {
    if (finished || submitBlocked()) {
      finished = true;
      return;
    }
    if (!scoreConsentElapsed(shownAt, clock())) return;
    finished = true;
    setSent(true);
    const token = readStoredSession()?.sessionToken;
    void postLeaderboardScore(currentLeaderboardBase(), {
      ...props.score,
      showOnLeaderboard: show,
      ...(token !== undefined ? { sessionToken: token } : {}),
    }).then((result) => {
      setMessage(result.ok ? "Score submitted." : result.error);
    });
  };

  const onExplicit = (): void => {
    send(readShowOnLeaderboard());
  };

  onMount(() => {
    shownAt = clock();
    onCleanup(registerSoloSubmit(onExplicit));
  });

  return (
    <LeaderboardConsent disabled={sent()} message={message()} onSubmit={send} />
  );
}
