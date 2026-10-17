import { JSXElement, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import {
  countdown,
  race,
  room,
  setShowOpponentCarets,
  showOpponentCarets,
} from "../store";
import { OpponentCarets } from "./OpponentCarets";
import { settingsSummary } from "./player-colors";
import { RaceProgressBars } from "./RaceProgressBars";

/** race chrome on the test page: info line, progress bars, 3-2-1, carets */
export function RaceOverlay(): JSXElement {
  return (
    <Show when={race()}>
      {(info) => (
        <div class="grid gap-3 pb-4" data-testid="mp-race">
          <div class="flex items-center justify-between gap-4 text-sm font-(--font) text-sub">
            <span>
              private · {room()?.code} · {settingsSummary(info().settings)}
            </span>
            <Button
              variant="text"
              text={showOpponentCarets() ? "carets on" : "carets off"}
              fa={{ icon: showOpponentCarets() ? "fa-eye" : "fa-eye-slash" }}
              class="py-1 text-sm"
              balloon={{ text: "show opponent carets", position: "left" }}
              dataset={{ "data-testid": "mp-toggle-carets" }}
              onClick={() => setShowOpponentCarets(!showOpponentCarets())}
            />
          </div>
          <RaceProgressBars />
          <Show when={(countdown() ?? 0) > 0}>
            <div
              class="pointer-events-none fixed inset-0 z-40 grid place-items-center"
              data-testid="mp-countdown"
            >
              <div class="grid justify-items-center gap-2 rounded-2xl bg-sub-alt/90 px-16 py-8">
                <span class="text-8xl font-(--font) text-main">
                  {countdown()}
                </span>
                <span class="text-sub">get ready</span>
              </div>
            </div>
          </Show>
          <OpponentCarets />
        </div>
      )}
    </Show>
  );
}
