import {
  createEffect,
  JSXElement,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
} from "solid-js";

import { Button } from "../../components/common/Button";
import { Fa } from "../../components/common/Fa";
import { ageConfirmed } from "../age-gate";
import { MULTIPLAYER_ENABLED } from "../flags";
import { leaderboardSubmitBlocked } from "../leaderboards";
import {
  connect,
  joinRoom,
  leaveQueue,
  leaveRoom,
  pendingLeaderboardFinish,
  resumeSession,
  submitPendingFinish,
} from "../race";
import {
  connectionStatus,
  inviteCode,
  queue,
  race,
  raceFinished,
  leaderboardsOn,
  meInLobby,
  results,
  room,
  setInviteCode,
} from "../store";
import { AgeGate } from "./AgeGate";
import { LeaderboardConsent } from "./LeaderboardConsent";
import { LeaderboardView } from "./LeaderboardView";
import { Lobby } from "./Lobby";
import { Podium } from "./Podium";
import { QuickMatchQueue } from "./QuickMatchQueue";
import { RaceHome } from "./RaceHome";
import { RaceProgressBars } from "./RaceProgressBars";

export function RacePage(): JSXElement {
  // nothing connects before the 13+ confirmation
  createEffect(
    on(ageConfirmed, (confirmed) => {
      if (!confirmed || !MULTIPLAYER_ENABLED) return;
      if (room() === undefined && inviteCode() === undefined) {
        resumeSession();
      }
    }),
  );

  // navigating away gives up a Quick Match wait (no-op unless queued)
  onCleanup(leaveQueue);

  // /r/CODE: join straight away (the server assigns a nickname)
  createEffect(() => {
    const code = inviteCode();
    if (code === undefined || !ageConfirmed() || !MULTIPLAYER_ENABLED) return;
    setInviteCode(undefined);
    if (room()?.code === code) return;
    connect();
    joinRoom(code);
  });

  return (
    <div class="grid content-start gap-6 py-8" data-testid="race-page">
      <Show
        when={MULTIPLAYER_ENABLED}
        fallback={
          <div class="text-center text-xl text-sub" data-testid="mp-disabled">
            multiplayer is not available right now
          </div>
        }
      >
        <Show when={ageConfirmed()} fallback={<AgeGate />}>
          <Show when={connectionStatus() === "reconnecting"}>
            <div class="text-center text-sub" data-testid="mp-reconnecting">
              <Fa icon="fa-circle-notch" spin /> reconnecting...
            </div>
          </Show>
          <Show
            when={room()}
            fallback={
              <Show when={queue()} fallback={<RaceHome />}>
                {(q) => <QuickMatchQueue state={q()} onCancel={leaveQueue} />}
              </Show>
            }
          >
            {(r) => (
              <div class="grid gap-6">
                <Show when={pendingLeaderboardFinish()}>
                  {(data) => (
                    <LeaderboardConsent
                      wpm={data().wpm}
                      onSubmit={(show) => {
                        const kids = leaderboardSubmitBlocked(
                          window.location.pathname,
                          document.referrer,
                          sessionStorage,
                        );
                        submitPendingFinish(kids ? false : show);
                      }}
                    />
                  )}
                </Show>
                <Switch fallback={<Lobby room={r()} />}>
                  <Match when={meInLobby()}>
                    <Lobby room={r()} />
                  </Match>
                  <Match when={results()}>
                    {(res) => <Podium room={r()} results={res()} />}
                  </Match>
                  <Match when={race() && raceFinished()}>
                    <div class="grid gap-4" data-testid="mp-waiting">
                      <div class="text-center text-xl text-sub">
                        you finished! waiting for the others...
                      </div>
                      <RaceProgressBars />
                    </div>
                  </Match>
                  <Match when={race()}>
                    <div class="grid gap-4" data-testid="mp-left-race">
                      <div class="text-center text-xl text-sub">
                        a race is running without you
                      </div>
                      <RaceProgressBars />
                      <Button
                        text="leave the room"
                        fa={{ icon: "fa-sign-out-alt" }}
                        class="mx-auto px-5 py-3"
                        dataset={{ "data-testid": "mp-leave" }}
                        onClick={() => leaveRoom()}
                      />
                    </div>
                  </Match>
                </Switch>
                <Show
                  when={
                    leaderboardsOn() &&
                    (results() !== undefined || race() !== undefined)
                  }
                >
                  <LeaderboardView
                    variant="compact"
                    initial={{
                      period: "daily",
                      mode: r().settings.mode,
                      mode2: r().settings.mode2,
                      language: r().settings.language,
                      punctuation: r().settings.punctuation,
                      numbers: r().settings.numbers,
                    }}
                  />
                </Show>
              </div>
            )}
          </Show>
        </Show>
      </Show>
    </div>
  );
}
