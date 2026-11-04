import { JSXElement } from "solid-js";

import {
  getBgMusicEnabled,
  getBgMusicVolume,
  setBgMusicEnabled,
  setBgMusicVolume,
} from "../../../../states/background-music";
import { Button } from "../../../common/Button";
import { Slider } from "../../../common/Slider";
import { SearchableSetting } from "../SearchableSetting";

export function BackgroundMusic(): JSXElement {
  return (
    <SearchableSetting
      key="bgMusic"
      title="background music"
      description="Loop a quiet track while you type. Off by default and saved only in this browser. It stays silent until you click or press a key. A royalty-free track is not bundled yet, so turning this on stays quiet."
      extraSearchKeywords="music volume loop audio soundtrack"
      fa={{ icon: "fa-music" }}
      inputs={
        <div class="grid gap-4">
          <div class="grid grid-cols-2 gap-2">
            <Button
              active={!getBgMusicEnabled()}
              ariaPressed={!getBgMusicEnabled()}
              onClick={() => {
                if (!getBgMusicEnabled()) return;
                setBgMusicEnabled(false);
              }}
            >
              off
            </Button>
            <Button
              active={getBgMusicEnabled()}
              ariaPressed={getBgMusicEnabled()}
              onClick={() => {
                if (getBgMusicEnabled()) return;
                setBgMusicEnabled(true);
              }}
            >
              on
            </Button>
          </div>
          <Slider
            label="background music volume"
            min={0}
            max={1}
            step={0.1}
            text={(value) => value.toFixed(1)}
            value={getBgMusicVolume()}
            onEveryChange={(value) => {
              if (value === getBgMusicVolume()) return;
              setBgMusicVolume(value);
            }}
          />
        </div>
      }
    />
  );
}
