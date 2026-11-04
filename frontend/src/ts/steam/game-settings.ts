import { createEffect, createRoot, createSignal } from "solid-js";

import { Config } from "../config/store";
import { configEvent } from "../events/config";
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

async function applyMasterVolume(master: number): Promise<void> {
  try {
    const { Howler } = await import("howler");
    Howler.volume(Config.soundVolume * master);
  } catch {
    // sounds not loaded yet; applied on the next change
  }
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
  // after the sound controller's own soundVolume handler
  configEvent.subscribe(({ key }) => {
    if (key === "soundVolume") {
      setTimeout(() => void applyMasterVolume(settings().masterVolume), 0);
    }
  });
  createRoot(() => {
    createEffect(() => {
      const s = settings();
      applyUiScale(s.uiScale);
      applyReducedMotion(s.reducedMotion);
      void applyMasterVolume(s.masterVolume);
      steamMusic.update(s);
    });
    createEffect(() => {
      steamMusic.setTyping(isTestActive() || isRaceActive());
    });
  });
}
