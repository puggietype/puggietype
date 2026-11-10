import { createSignal, JSXElement, onCleanup, onMount, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import { cn } from "../../utils/cn";
import { readStoredSession } from "../client";
import {
  readShowOnLeaderboard,
  setShowOnLeaderboard,
  showOnLeaderboard,
} from "../leaderboard-pref";
import {
  currentLeaderboardBase,
  leaderboardSubmitBlocked,
  postLeaderboardScore,
  SCORE_CONSENT_MS,
  scoreConsentElapsed,
  soloRanksHref,
  type ScoreSubmission,
} from "../leaderboards";
import { settingsSummary, PRIMARY_BUTTON } from "./ui";

type SoloScore = Omit<ScoreSubmission, "showOnLeaderboard" | "sessionToken">;

export type SoloSubmitAvailability = "checking" | "off" | "on";

function freezeScore(score: SoloScore): SoloScore {
  return {
    mode: score.mode,
    mode2: score.mode2,
    language: score.language,
    punctuation: score.punctuation,
    numbers: score.numbers,
    wpm: score.wpm,
    acc: score.acc,
    raw: score.raw,
    chars: score.chars,
    durationMs: score.durationMs,
  };
}

/**
 * Submit the finished solo test. The bucket is copied once and does not follow
 * ranks filters. A remembered checkbox never posts by itself.
 */
export function SoloLeaderboardSubmit(props: {
  score?: SoloScore;
  invalid?: boolean;
  kids?: boolean;
  availability?: SoloSubmitAvailability;
  /** tests inject a clock; production uses Date.now */
  now?: () => number;
}): JSXElement {
  const [unlocked, setUnlocked] = createSignal(false);
  const [phase, setPhase] = createSignal<"idle" | "sending" | "done">("idle");
  const [message, setMessage] = createSignal<string | undefined>();
  const clock = (): number => props.now?.() ?? Date.now();
  let shownAt = Number.POSITIVE_INFINITY;
  let frozen: SoloScore | undefined;
  let inflight = false;

  const snapshot = (): SoloScore | undefined => {
    if (frozen !== undefined) return frozen;
    if (props.score === undefined) return undefined;
    frozen = freezeScore(props.score);
    return frozen;
  };

  const kidsBlocked = (): boolean => {
    if (props.kids === true) return true;
    return leaderboardSubmitBlocked(
      window.location.pathname,
      document.referrer,
      sessionStorage,
    );
  };

  const availability = (): SoloSubmitAvailability => props.availability ?? "on";

  const blockReason = (): string | undefined => {
    if (availability() === "checking") return "Checking whether ranks are on…";
    if (availability() === "off") {
      return "Ranks aren't available on this server.";
    }
    if (kidsBlocked()) return "Scores from the kids guides aren't submitted.";
    if (props.invalid === true) return "This result can't be submitted.";
    if (snapshot() === undefined) {
      return "This test can't be submitted to ranks.";
    }
    if (phase() === "sending") return "Submitting…";
    if (phase() === "done") return undefined;
    if (!unlocked()) return "You can submit this score in a moment.";
    return undefined;
  };

  const canSend = (): boolean =>
    blockReason() === undefined &&
    phase() === "idle" &&
    snapshot() !== undefined;

  const send = (): void => {
    const score = snapshot();
    if (score === undefined || !canSend() || inflight) return;
    if (!scoreConsentElapsed(shownAt, clock())) return;
    inflight = true;
    setPhase("sending");
    setMessage(undefined);
    const token = readStoredSession()?.sessionToken;
    void postLeaderboardScore(currentLeaderboardBase(), {
      ...score,
      showOnLeaderboard: readShowOnLeaderboard(),
      ...(token !== undefined ? { sessionToken: token } : {}),
    }).then((result) => {
      inflight = false;
      if (result.ok && result.recorded !== false) {
        setPhase("done");
        setMessage("Score submitted.");
        return;
      }
      if (result.ok) {
        setPhase("idle");
        setMessage("This score was not added to the board.");
        return;
      }
      setPhase("idle");
      setMessage(result.error);
    });
  };

  onMount(() => {
    shownAt = clock();
    const arm = setTimeout(() => setUnlocked(true), SCORE_CONSENT_MS);
    onCleanup(() => clearTimeout(arm));
  });

  const reason = (): string | undefined => blockReason();
  const choiceDisabled = (): boolean =>
    kidsBlocked() ||
    props.invalid === true ||
    availability() !== "on" ||
    snapshot() === undefined ||
    phase() !== "idle";
  const browseHref = (): string => {
    const score = snapshot();
    return score === undefined ? "/leaderboards" : soloRanksHref(score);
  };

  return (
    <section
      class="mb-8 grid gap-3 rounded-lg bg-sub-alt p-4"
      data-testid="lb-submit-card"
      aria-label="Submit your score"
    >
      <h2 class="text-lg text-text">Submit score</h2>
      <Show when={snapshot()}>
        {(score) => (
          <p class="text-sm text-sub" data-testid="lb-settings">
            This test · {settingsSummary(score())}
          </p>
        )}
      </Show>
      <p class="text-sm text-sub" data-testid="lb-solo-note">
        Solo scores are self-reported and checked for plausibility, not
        verified.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <label
          class={cn("flex items-center gap-3 text-text", {
            "cursor-pointer": !choiceDisabled(),
            "cursor-not-allowed opacity-60": choiceDisabled(),
          })}
        >
          <input
            type="checkbox"
            name="showOnLeaderboard"
            class="size-4 shrink-0 accent-main"
            data-testid="lb-show-score"
            checked={showOnLeaderboard()}
            disabled={choiceDisabled()}
            onChange={(e) => setShowOnLeaderboard(e.currentTarget.checked)}
          />
          Show my score on the leaderboard
        </label>
        <Button
          type="button"
          text={phase() === "sending" ? "Submitting…" : "Submit score"}
          fa={{ icon: "fa-crown" }}
          class={cn(PRIMARY_BUTTON, "px-5 py-3")}
          disabled={!canSend()}
          ariaLabel={
            reason() !== undefined ? `Submit score. ${reason()}` : undefined
          }
          dataset={{ "data-testid": "lb-submit" }}
          onClick={() => send()}
        />
      </div>
      <Show when={reason()}>
        {(text) => (
          <p class="text-sm text-sub" data-testid="lb-submit-reason">
            {text()}
          </p>
        )}
      </Show>
      <Show when={message()}>
        {(text) => (
          <p
            class="text-sm text-text"
            role="status"
            data-testid="lb-submit-status"
          >
            {text()}
          </p>
        )}
      </Show>
      <a
        href={browseHref()}
        router-link
        class="w-max text-sm text-sub underline"
        data-testid="lb-browse"
      >
        Browse solo ranks
      </a>
    </section>
  );
}
