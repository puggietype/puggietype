import { JSXElement, onMount, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import { isFlagEnabled } from "../feature-flags";
import { leaveRoom, resumeSession } from "../race";
import {
  countdown,
  race,
  room,
  setShowOpponentCarets,
  showOpponentCarets,
} from "../store";
import { OpponentCarets } from "./OpponentCarets";
import { OpponentDogs } from "./OpponentDogs";
import { RaceProgressBars } from "./RaceProgressBars";
import { settingsSummary } from "./ui";

/** race chrome on the test page: info line, progress bars, 3-2-1, carets */
export function RaceOverlay(): JSXElement {
  // a reload on the test page mid-race rejoins (and restores overridden config)
  onMount(() => {
    if (room() === undefined) resumeSession();
  });

  return (
    <Show when={race()}>
      {(info) => (
        <div class="grid min-w-0 gap-3 pb-12" data-testid="mp-race">
          {/* one row: the info truncates, the actions go icon-only on phones */}
          <div class="flex min-w-0 items-center gap-x-4 text-sm font-(--font) text-sub">
            <span class="min-w-0 flex-1 truncate">
              <span class="hidden sm:inline">
                {room()?.open ? "open" : "private"} ·{" "}
              </span>
              {room()?.code} · {settingsSummary(info().settings)}
            </span>
            <Button
              variant="text"
              fa={{ icon: "fa-sign-out-alt" }}
              class="shrink-0 py-1 text-sm"
              ariaLabel="leave race"
              dataset={{ "data-testid": "mp-leave-race" }}
              onClick={() => leaveRoom()}
            >
              <span class="hidden sm:inline">leave race</span>
            </Button>
            <Button
              variant="text"
              fa={{ icon: showOpponentCarets() ? "fa-eye" : "fa-eye-slash" }}
              class="shrink-0 py-1 text-sm"
              balloon={{
                text: isFlagEnabled("opponentDogs")
                  ? showOpponentCarets()
                    ? "hide opponents"
                    : "show opponents"
                  : showOpponentCarets()
                    ? "hide opponent carets"
                    : "show opponent carets",
                position: "left",
              }}
              dataset={{ "data-testid": "mp-toggle-carets" }}
              onClick={() => setShowOpponentCarets(!showOpponentCarets())}
            >
              <span class="hidden sm:inline">
                {showOpponentCarets() ? "carets on" : "carets off"}
              </span>
            </Button>
          </div>
          {/* one "show opponents" toggle covers carets and dogs */}
          <Show when={isFlagEnabled("opponentDogs") && showOpponentCarets()}>
            <OpponentDogs />
          </Show>
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
