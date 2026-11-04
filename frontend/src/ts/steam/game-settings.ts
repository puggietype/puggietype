import { createEffect, createRoot, createSignal } from "solid-js";

import "./reduced-motion.css";
import { isRaceActive } from "../multiplayer/engine-hooks";
import { getPlatform } from "../platform";
import { isTestActive } from "../states/test";
import { SteamMusic, type MusicAudio } from "./music";
import {
  readSteamSettings,
  type SteamSettings,
  writeSteamSettings,
} from "./settings-store";

/**
 * Steam-only runtime for the game settings: UI scale, reduced motion,
 * master volume and background music. Loaded from index.tsx behind the
 * inline __PLATFORM__ check, so none of it is in the web build.
 */
const storage = getPlatform().storage;
const [settings, setSettingsSignal] = createSignal<SteamSettings>(
  readSteamSettings(storage),
);

export const getSteamSettings = settings;

function createAudio(): MusicAudio {
  const audio = new Audio();
  audio.preload = "none";
  return audio;
}

export const steamMusic = new SteamMusic(settings(), {
  createAudio,
  getPathname: () => window.location.pathname,
});

export function updateSteamSettings(
  change: (s: SteamSettings) => SteamSettings,
): void {
  const next = change(settings());
  writeSteamSettings(storage, next);
  setSettingsSignal(next);
}

let nativeMatchMedia: typeof window.matchMedia | undefined;

/** (prefers-reduced-motion) reads true while the setting is on */
export function applyReducedMotion(on: boolean): void {
  document.documentElement.classList.toggle("reduce-motion", on);
  if (typeof window.matchMedia !== "function") return;
  nativeMatchMedia ??= window.matchMedia.bind(window);
  const native = nativeMatchMedia;
  window.matchMedia = (query: string): MediaQueryList => {
    if (
      on &&
      query.includes("prefers-reduced-motion") &&
      !query.includes("no-preference")
    ) {
      const real = native(query);
      return Object.assign(Object.create(real) as MediaQueryList, {
        matches: true,
        media: query,
      });
    }
    return native(query);
  };
}

export function applyUiScale(scale: number): void {
  document.documentElement.style.setProperty("zoom", String(scale));
  document.documentElement.dataset["uiScale"] = String(scale);
}

const masterGains = new Set<GainNode>();
let masterVolume = 1;

/**
 * Master volume for every Web Audio sound: each AudioContext created after
 * this (Howler's and the synthesized click/error tones) routes its
 * destination through one master GainNode. HTML audio (the music) applies
 * the master volume itself.
 */
export function installMasterGain(target: {
  AudioContext?: typeof AudioContext;
}): void {
  const Native = target.AudioContext;
  if (Native === undefined) return;
  class MasterAudioContext extends Native {
    readonly #master: GainNode;
    constructor(options?: AudioContextOptions) {
      super(options);
      this.#master = this.createGain();
      this.#master.gain.value = masterVolume;
      this.#master.connect(super.destination);
      masterGains.add(this.#master);
    }
    // oxlint-disable-next-line typescript/class-literal-property-style -- forwards to the master gain
    override get destination(): AudioDestinationNode {
      return this.#master as unknown as AudioDestinationNode;
    }
  }
  target.AudioContext = MasterAudioContext;
}

export function applyMasterVolume(volume: number): void {
  masterVolume = volume;
  for (const g of masterGains) g.gain.value = volume;
}

let installed = false;

export function installSteamGameSettings(): void {
  if (installed) return;
  installed = true;
  const onGesture = (): void => {
    document.removeEventListener("pointerdown", onGesture, true);
    document.removeEventListener("keydown", onGesture, true);
    steamMusic.noteGesture();
  };
  document.addEventListener("pointerdown", onGesture, true);
  document.addEventListener("keydown", onGesture, true);
  installMasterGain(window);
  createRoot(() => {
    createEffect(() => {
      const s = settings();
      applyUiScale(s.uiScale);
      applyReducedMotion(s.reducedMotion);
      applyMasterVolume(s.masterVolume);
      steamMusic.update(s);
    });
    createEffect(() => {
      steamMusic.setTyping(isTestActive() || isRaceActive());
    });
  });
}
