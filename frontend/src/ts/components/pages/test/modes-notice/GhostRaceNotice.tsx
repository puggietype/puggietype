import { Show } from "solid-js";

import { isRaceActive } from "../../../../multiplayer/engine-hooks";
import { isFlagEnabled } from "../../../../multiplayer/feature-flags";
import { getGhostHint } from "../../../../test/ghost-caret";
import { Fa } from "../../../common/Fa";

/** ghostRace flag: "racing your ghost · 80 wpm" / how to get one */
export function GhostRaceNotice() {
  return (
    <Show
      when={isFlagEnabled("ghostRace") && !isRaceActive() && getGhostHint()}
    >
      {(hint) => (
        <div id="ghostRaceHint" class="flex items-center gap-2 text-sub-alt">
          <Fa icon="fa-ghost" />
          {hint()}
        </div>
      )}
    </Show>
  );
}
