import { createEffect, JSXElement, on, Show } from "solid-js";

import {
  ageConfirmed,
  confirmAge,
  isAgeConfirmed,
} from "../../../multiplayer/age-gate";
import { LeaderboardView } from "../../../multiplayer/components/LeaderboardView";
import { PRIMARY_BUTTON } from "../../../multiplayer/components/ui";
import { MULTIPLAYER_ENABLED } from "../../../multiplayer/flags";
import { connect } from "../../../multiplayer/race";
import {
  connectionStatus,
  leaderboardsOn,
  serverFeatures,
} from "../../../multiplayer/store";
import { cn } from "../../../utils/cn";
import { isStandalone } from "../../../utils/env";
import { Button } from "../../common/Button";
import { LeaderboardPage } from "./LeaderboardPage";

function askForFeatures(): void {
  if (!MULTIPLAYER_ENABLED || !isAgeConfirmed()) return;
  connect();
}

/** game-server board, or the account board, or a quiet unavailable state */
export function LeaderboardRoute(): JSXElement {
  createEffect(
    on(ageConfirmed, (confirmed) => {
      if (confirmed) askForFeatures();
    }),
  );

  return (
    <div class="mx-auto grid w-full max-w-3xl gap-6 py-8">
      <Show
        when={leaderboardsOn()}
        fallback={
          <Show when={isStandalone()} fallback={<LeaderboardPage />}>
            <StandaloneFallback
              onConfirm={() => {
                confirmAge();
                askForFeatures();
              }}
            />
          </Show>
        }
      >
        <LeaderboardView variant="page" />
      </Show>
    </div>
  );
}

function StandaloneFallback(props: { onConfirm: () => void }): JSXElement {
  const checking = (): boolean =>
    MULTIPLAYER_ENABLED &&
    ageConfirmed() &&
    serverFeatures() === undefined &&
    connectionStatus() !== "open";

  return (
    <section
      class="grid justify-items-start gap-3 rounded-lg bg-sub-alt p-6"
      data-testid="lb-unavailable"
    >
      <h1 class="text-3xl text-text">solo ranks</h1>
      <Show
        when={ageConfirmed()}
        fallback={
          <>
            <p class="text-sub">
              Leaderboards load from the game server. Confirm you are 13 or
              older to check whether they are on.
            </p>
            <Button
              text="I'm 13 or older"
              fa={{ icon: "fa-check" }}
              class={cn(PRIMARY_BUTTON, "px-5 py-3")}
              dataset={{ "data-testid": "lb-age-confirm" }}
              onClick={() => props.onConfirm()}
            />
          </>
        }
      >
        <Show
          when={checking()}
          fallback={
            <p class="text-sub" data-testid="lb-off">
              Leaderboards are not available on this server.
            </p>
          }
        >
          <p class="text-sub" data-testid="lb-checking">
            Checking whether leaderboards are on…
          </p>
        </Show>
      </Show>
    </section>
  );
}
