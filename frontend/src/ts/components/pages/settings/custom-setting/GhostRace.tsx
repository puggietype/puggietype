import { JSXElement } from "solid-js";

import { showSuccessNotification } from "../../../../states/notifications";
import {
  clearAllGhosts,
  isGhostRaceEnabled,
  setGhostRaceEnabled,
} from "../../../../test/ghost-caret";
import { Button } from "../../../common/Button";
import { SearchableSetting } from "../SearchableSetting";

/** local-only ghost race toggle; SettingsPage renders it only with the flag on */
export function GhostRace(): JSXElement {
  return (
    <SearchableSetting
      key="ghostRace"
      title="ghost race"
      description="Race a faint caret that replays your personal best for the same test. Stored only on this device."
      extraSearchKeywords="ghost replay pb personal best race caret"
      fa={{ icon: "fa-ghost" }}
      inputs={
        <div class="grid gap-2">
          <div class="grid grid-cols-2 gap-2">
            <Button
              active={!isGhostRaceEnabled()}
              ariaPressed={!isGhostRaceEnabled()}
              onClick={() => setGhostRaceEnabled(false)}
            >
              off
            </Button>
            <Button
              active={isGhostRaceEnabled()}
              ariaPressed={isGhostRaceEnabled()}
              onClick={() => setGhostRaceEnabled(true)}
            >
              on
            </Button>
          </div>
          <Button
            onClick={() => {
              clearAllGhosts();
              showSuccessNotification("Ghosts cleared");
            }}
          >
            clear ghosts
          </Button>
        </div>
      }
    />
  );
}
