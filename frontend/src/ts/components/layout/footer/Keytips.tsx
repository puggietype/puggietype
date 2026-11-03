import { JSXElement, Show } from "solid-js";

import { getConfig } from "../../../config/store";
import { isRaceRestartLocked } from "../../../multiplayer/engine-hooks";
import { inRace, onRaceResults } from "../../../multiplayer/store";
import { getActivePage } from "../../../states/core";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { CommandlineHotkey } from "../../hotkeys/CommandlineHotkey";
import { QuickRestartHotkey } from "../../hotkeys/QuickRestartHotkey";

export function Keytips(): JSXElement {
  return (
    <Show when={getConfig.showKeyTips}>
      <div
        class={cn("mb-8 flex flex-col items-center gap-2 transition-opacity", {
          "opacity-0": getFocus(),
        })}
      >
        {/* multiplayer has no restart: no tip anywhere on /race or /r/* */}
        <Show
          when={
            getActivePage() !== "race" &&
            !isRaceRestartLocked() &&
            !inRace() &&
            !onRaceResults()
          }
        >
          <div class="flex items-center gap-2" data-testid="keytip-restart">
            <QuickRestartHotkey />
            <span>- restart test</span>
          </div>
        </Show>

        <div class="flex items-center gap-2">
          <CommandlineHotkey />
          <span>- command line</span>
        </div>
      </div>
    </Show>
  );
}
