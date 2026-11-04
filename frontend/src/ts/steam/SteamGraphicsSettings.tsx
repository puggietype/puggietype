import { JSXElement } from "solid-js";

import { Button } from "../components/common/Button";
import { H2 } from "../components/common/Headers";
import { SearchableSetting } from "../components/pages/settings/SearchableSetting";
import { getPlatform } from "../platform";
import { Choice, ON_OFF, set } from "./Choice";
import { getSteamSettings } from "./game-settings";
import { UI_SCALES } from "./settings-store";

/** Steam-only Graphics settings (desktop display). */
export function SteamGraphicsSettings(): JSXElement {
  const win = getPlatform().window;
  return (
    <div data-testid="steam-graphics" class="grid gap-8">
      <H2 text="display" />
      <SearchableSetting
        key="steamFullscreen"
        title="fullscreen"
        description="Show PuggieType fullscreen."
        fa={{ icon: "fa-expand" }}
        inputs={
          <Button
            id="steam-fullscreen"
            class="w-full"
            onClick={() => win.toggleFullscreen()}
            text="toggle fullscreen"
          />
        }
      />
      <SearchableSetting
        key="steamUiScale"
        title="ui scale"
        description="Make everything larger or smaller."
        fa={{ icon: "fa-search-plus" }}
        inputs={
          <Choice
            id="steam-ui-scale"
            options={UI_SCALES.map((v) => ({
              value: v,
              text: `${Math.round(v * 100)}%`,
            }))}
            selected={getSteamSettings().uiScale}
            onSelect={(uiScale) => set((s) => ({ ...s, uiScale }))}
          />
        }
      />
      <SearchableSetting
        key="steamReducedMotion"
        title="reduced motion"
        description="Use fewer animations, as if your system asked for reduced motion."
        fa={{ icon: "fa-pause-circle" }}
        inputs={
          <Choice
            id="steam-reduced-motion"
            options={ON_OFF}
            selected={getSteamSettings().reducedMotion}
            onSelect={(reducedMotion) => set((s) => ({ ...s, reducedMotion }))}
          />
        }
      />
    </div>
  );
}
