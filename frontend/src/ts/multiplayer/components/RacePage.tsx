import {
  createEffect,
  JSXElement,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
} from "solid-js";

import { AdSlot } from "../../components/ads/AdSlot";
import { Button } from "../../components/common/Button";
import { Fa } from "../../components/common/Fa";
import { ageConfirmed } from "../age-gate";
import { MULTIPLAYER_ENABLED } from "../flags";
import {
  connect,
  joinRoom,
  leaveQueue,
  leaveRoom,
  resumeSession,
} from "../race";
import {
  connectionStatus,
  inviteCode,
  queue,
  race,
  raceFinished,
  results,
  room,
  setInviteCode,
} from "../store";
import { AgeGate } from "./AgeGate";
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
                {(q) => (
                  <>
                    <QuickMatchQueue state={q()} onCancel={leaveQueue} />
                    <AdSlot kind="lobby" />
                  </>
                )}
              </Show>
            }
          >
            {(r) => (
              <Switch
                fallback={
                  <>
                    <Lobby room={r()} />
                    <Show when={r().phase === "lobby" && race() === undefined}>
                      <AdSlot kind="lobby" />
                    </Show>
                  </>
                }
              >
                <Match when={results()}>
                  {(res) => (
                    <>
                      <Podium room={r()} results={res()} />
                      <AdSlot kind="result" />
                    </>
                  )}
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
            )}
          </Show>
        </Show>
      </Show>
    </div>
  );
}
