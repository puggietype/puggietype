import { JSXElement } from "solid-js";

import { H2 } from "../components/common/Headers";
import { Slider } from "../components/common/Slider";
import { SearchableSetting } from "../components/pages/settings/SearchableSetting";
import { Choice, ON_OFF, set } from "./Choice";
import { getSteamSettings } from "./game-settings";
import { MUSIC_TRACKS, type SteamSettings } from "./settings-store";

/** Steam-only Sound settings: master volume and background music. */
export function SteamSoundSettings(): JSXElement {
  const music = (): SteamSettings["music"] => getSteamSettings().music;
  const setMusic = (change: Partial<SteamSettings["music"]>): void =>
    set((s) => ({ ...s, music: { ...s.music, ...change } }));
  return (
    <div data-testid="steam-sound" class="grid gap-8">
      <H2 text="music and volume" />
      <SearchableSetting
        key="steamMasterVolume"
        title="master volume"
        description="Scales the music and the typing sounds together."
        fa={{ icon: "fa-volume-up" }}
        inputs={
          <Slider
            label="master volume"
            min={0}
            max={1}
            step={0.1}
            text={(v) => v.toFixed(1)}
            value={getSteamSettings().masterVolume}
            onEveryChange={(masterVolume) =>
              set((s) => ({ ...s, masterVolume }))
            }
          />
        }
      />
      <SearchableSetting
        key="steamSfxVolume"
        title="sound effects volume"
        description="Volume of the typing and error sounds."
        fa={{ icon: "fa-keyboard" }}
        inputs={
          <Slider
            label="sound effects volume"
            min={0}
            max={1}
            step={0.05}
            text={(v) => `${Math.round(v * 100)}%`}
            value={getSteamSettings().sfxVolume}
            onEveryChange={(sfxVolume) => set((s) => ({ ...s, sfxVolume }))}
          />
        }
      />
      <SearchableSetting
        key="steamMute"
        title="mute"
        description="Silence all sounds and music."
        fa={{ icon: "fa-volume-mute" }}
        inputs={
          <Choice
            id="steam-mute"
            options={ON_OFF}
            selected={getSteamSettings().muted}
            onSelect={(muted) => set((s) => ({ ...s, muted }))}
          />
        }
      />
      <SearchableSetting
        key="steamMusic"
        title="background music"
        description="Play quiet background music. On by default at 35%."
        extraSearchKeywords="music soundtrack audio"
        fa={{ icon: "fa-music" }}
        inputs={
          <div class="grid gap-4">
            <Choice
              id="steam-music-enabled"
              options={ON_OFF}
              selected={music().enabled}
              onSelect={(enabled) => setMusic({ enabled })}
            />
            <Slider
              label="music volume"
              min={0}
              max={1}
              step={0.05}
              text={(v) => `${Math.round(v * 100)}%`}
              value={music().volume}
              onEveryChange={(volume) => setMusic({ volume })}
            />
          </div>
        }
      />
      <SearchableSetting
        key="steamMusicTrack"
        title="music track"
        description="Pick a track, or shuffle between them."
        fa={{ icon: "fa-list" }}
        inputs={
          <Choice
            id="steam-music-track"
            options={[
              { value: "shuffle" as const, text: "shuffle" },
              ...MUSIC_TRACKS.map((t) => ({ value: t.id, text: t.title })),
            ]}
            selected={music().track}
            onSelect={(track) => setMusic({ track })}
          />
        }
      />
      <SearchableSetting
        key="steamMusicWhileTyping"
        title="music while typing"
        description="During tests and races, pause the music, lower it under the typing sounds, or keep it as is."
        fa={{ icon: "fa-keyboard" }}
        inputs={
          <Choice
            id="steam-music-while-typing"
            options={[
              { value: "pause" as const, text: "pause" },
              { value: "lower" as const, text: "lower" },
              { value: "keep" as const, text: "keep" },
            ]}
            selected={music().whileTyping}
            onSelect={(whileTyping) => setMusic({ whileTyping })}
          />
        }
      />
    </div>
  );
}
