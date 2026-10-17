import {
  createEffect,
  JSXElement,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";

import { Fa } from "../../components/common/Fa";
import { connect, joinRoom, resumeSession } from "../race";
import {
  connectionStatus,
  inviteCode,
  loadNickname,
  race,
  results,
  room,
  saveNickname,
  setInviteCode,
} from "../store";
import { Lobby } from "./Lobby";
import { Podium } from "./Podium";
import { RaceHome } from "./RaceHome";
import { RaceProgressBars } from "./RaceProgressBars";

function defaultNickname(): string {
  return `pug${Math.floor(100 + Math.random() * 900)}`;
}

export function RacePage(): JSXElement {
  onMount(() => {
    if (room() === undefined && inviteCode() === undefined) {
      resumeSession(loadNickname());
    }
  });

  // /r/CODE: join straight away (with a generated name if there is none yet)
  createEffect(() => {
    const code = inviteCode();
    if (code === undefined) return;
    setInviteCode(undefined);
    if (room()?.code === code) return;
    let name = loadNickname();
    if (name === "") {
      name = defaultNickname();
      saveNickname(name);
    }
    connect(name);
    joinRoom(code);
  });

  return (
    <div class="grid content-start gap-6 py-8" data-testid="race-page">
      <Show when={connectionStatus() === "reconnecting"}>
        <div class="text-center text-sub" data-testid="mp-reconnecting">
          <Fa icon="fa-circle-notch" spin /> reconnecting...
        </div>
      </Show>
      <Show when={room()} fallback={<RaceHome />}>
        {(r) => (
          <Switch fallback={<Lobby room={r()} />}>
            <Match when={results()}>
              {(res) => <Podium room={r()} results={res()} />}
            </Match>
            <Match when={race()}>
              <div class="grid gap-4" data-testid="mp-waiting">
                <div class="text-center text-xl text-sub">
                  you finished! waiting for the others...
                </div>
                <RaceProgressBars />
              </div>
            </Match>
          </Switch>
        )}
      </Show>
    </div>
  );
}
