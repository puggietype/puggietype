import { JSXElement, Show } from "solid-js";

import { Button } from "../components/common/Button";
import { H2 } from "../components/common/Headers";
import { Slider } from "../components/common/Slider";
import { SearchableSetting } from "../components/pages/settings/SearchableSetting";
import { Choice, ON_OFF, set } from "./Choice";
import { getSteamSettings, isRestartRequired } from "./game-settings";
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  DEFAULT_STEAM_SETTINGS,
  FPS_CAPS,
  RESOLUTIONS,
  UI_SCALES,
} from "./settings-store";

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** Steam-only Graphics settings (desktop display). */
export function SteamGraphicsSettings(): JSXElement {
  const g = getSteamSettings;
  return (
    <div data-testid="steam-graphics" class="grid gap-8">
      <H2 text="display" />
      <Show when={isRestartRequired()}>
        <p data-testid="steam-restart-required" role="status">
          Restart PuggieType to apply all display changes.
        </p>
      </Show>
      <SearchableSetting
        key="steamDisplayMode"
        title="display mode"
        description="Windowed, borderless (fills the screen without a frame) or fullscreen. Switching to or from borderless applies after a restart."
        extraSearchKeywords="fullscreen window borderless"
        fa={{ icon: "fa-expand" }}
        inputs={
          <Choice
            id="steam-display-mode"
            options={[
              { value: "windowed" as const, text: "windowed" },
              { value: "borderless" as const, text: "borderless" },
              { value: "fullscreen" as const, text: "fullscreen" },
            ]}
            selected={g().displayMode}
            onSelect={(displayMode) => set((s) => ({ ...s, displayMode }))}
          />
        }
      />
      <SearchableSetting
        key="steamResolution"
        title="resolution"
        description="Window size in windowed mode. Native fills the screen."
        fa={{ icon: "fa-desktop" }}
        inputs={
          <Choice
            id="steam-resolution"
            wide
            options={RESOLUTIONS.map((r) => ({
              value: r,
              text: r === "native" ? "native" : r.replace("x", "×"),
            }))}
            selected={g().resolution}
            onSelect={(resolution) => set((s) => ({ ...s, resolution }))}
          />
        }
      />
      <SearchableSetting
        key="steamVsync"
        title="vsync"
        description="Sync frames to your display's refresh rate. Restart PuggieType to apply."
        fa={{ icon: "fa-sync" }}
        inputs={
          <Choice
            id="steam-vsync"
            options={ON_OFF}
            selected={g().vsync}
            onSelect={(vsync) => set((s) => ({ ...s, vsync }))}
          />
        }
      />
      <SearchableSetting
        key="steamFpsCap"
        title="frame rate cap"
        description="Limit how many frames per second animations run at. Unlimited goes above your refresh rate only with VSync off."
        extraSearchKeywords="fps"
        fa={{ icon: "fa-tachometer-alt" }}
        inputs={
          <Choice
            id="steam-fps-cap"
            // 5 options: 3 + (2 with "unlimited" filling the row)
            columns={3}
            options={FPS_CAPS.map((v) => ({
              value: v,
              text: v === 0 ? "unlimited" : String(v),
            }))}
            selected={g().fpsCap}
            onSelect={(fpsCap) => set((s) => ({ ...s, fpsCap }))}
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
            // 6 options: two even rows of 3 (QA PR30-SCALE-ORPHAN)
            columns={3}
            options={UI_SCALES.map((v) => ({ value: v, text: pct(v) }))}
            selected={g().uiScale}
            onSelect={(uiScale) => set((s) => ({ ...s, uiScale }))}
          />
        }
      />
      <SearchableSetting
        key="steamAnimation"
        title="animation quality"
        description="Full, reduced (as if your system asked for reduced motion) or off (no animations)."
        extraSearchKeywords="reduced motion"
        fa={{ icon: "fa-pause-circle" }}
        inputs={
          <Choice
            id="steam-animation"
            options={[
              { value: "full" as const, text: "full" },
              { value: "reduced" as const, text: "reduced" },
              { value: "off" as const, text: "off" },
            ]}
            selected={g().animation}
            onSelect={(animation) => set((s) => ({ ...s, animation }))}
          />
        }
      />
      <SearchableSetting
        key="steamBrightness"
        title="brightness"
        description="Make PuggieType brighter or darker."
        fa={{ icon: "fa-sun" }}
        inputs={
          <div data-testid="steam-brightness" data-steam-slider>
            <Slider
              label="brightness"
              min={BRIGHTNESS_MIN}
              max={BRIGHTNESS_MAX}
              step={0.05}
              text={pct}
              value={g().brightness}
              onEveryChange={(brightness) => set((s) => ({ ...s, brightness }))}
            />
          </div>
        }
      />
      <SearchableSetting
        key="steamGraphicsReset"
        title="reset graphics"
        description="Put every graphics setting above back to its default."
        fa={{ icon: "fa-undo" }}
        inputs={
          <Button
            id="steam-graphics-reset"
            class="w-full"
            onClick={() =>
              set((s) => ({
                ...s,
                displayMode: DEFAULT_STEAM_SETTINGS.displayMode,
                resolution: DEFAULT_STEAM_SETTINGS.resolution,
                vsync: DEFAULT_STEAM_SETTINGS.vsync,
                fpsCap: DEFAULT_STEAM_SETTINGS.fpsCap,
                uiScale: DEFAULT_STEAM_SETTINGS.uiScale,
                animation: DEFAULT_STEAM_SETTINGS.animation,
                brightness: DEFAULT_STEAM_SETTINGS.brightness,
              }))
            }
            text="reset to defaults"
          />
        }
      />
    </div>
  );
}
