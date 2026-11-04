import { createEffect, createRoot, createSignal } from "solid-js";

import {
  BackgroundMusic,
  BG_MUSIC_SRC,
  BG_MUSIC_STORAGE_KEY,
  BG_MUSIC_TRACKS,
  BgMusicAudio,
  BgMusicSettings,
  BgMusicSettingsSchema,
  DEFAULT_BG_MUSIC,
  isKidsGuidePath,
  readBgMusicSettings,
} from "../controllers/background-music";
import type { BackgroundMusicHold } from "../controllers/background-music";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";

const bgMusicLS = new LocalStorageWithSchema({
  key: BG_MUSIC_STORAGE_KEY,
  schema: BgMusicSettingsSchema,
  fallback: DEFAULT_BG_MUSIC,
});

function createHtmlAudio(src: string): BgMusicAudio {
  const audio = new Audio();
  audio.preload = "none";
  audio.loop = true;
  audio.src = src;
  // in the DOM (hidden, no controls) so it shows with the page's media
  audio.hidden = true;
  audio.dataset["bgMusic"] = "";
  document.body.append(audio);
  return audio;
}

export const backgroundMusic = new BackgroundMusic({
  store: {
    get: () => bgMusicLS.get(),
    set: (settings) => {
      bgMusicLS.set(settings);
    },
    remove: () => {
      bgMusicLS.remove();
    },
  },
  getPathname: () => window.location.pathname,
  createAudio: createHtmlAudio,
  src: BG_MUSIC_SRC,
  tracks: BG_MUSIC_TRACKS,
});

const [settings, setSettings] = createSignal<BgMusicSettings>(
  backgroundMusic.getSettings(),
);

function publish(): void {
  setSettings(backgroundMusic.getSettings());
}

export function getBgMusicEnabled(): boolean {
  return settings().enabled;
}

export function getBgMusicVolume(): number {
  return settings().volume;
}

export function setBgMusicEnabled(enabled: boolean): void {
  backgroundMusic.setEnabled(enabled);
  publish();
}

export function setBgMusicVolume(volume: number): void {
  backgroundMusic.setVolume(volume);
  publish();
}

export function resetBackgroundMusic(): void {
  backgroundMusic.reset();
  publish();
}

export type BackgroundMusicHoldSources = {
  isTestActive: () => boolean;
  isRaceActive: () => boolean;
  isDocumentHidden: () => boolean;
  subscribeVisibility: (listener: () => void) => () => void;
};

let teardown: (() => void) | undefined;
let disposeHold: (() => void) | undefined;

/**
 * Pause while a test or race is active, or while the document is hidden,
 * then resume if music is still enabled. No listeners on the kids guide.
 */
export function bindBackgroundMusicHold(
  sources: BackgroundMusicHoldSources,
): void {
  disposeHold?.();
  disposeHold = undefined;
  if (isKidsGuidePath(window.location.pathname)) return;

  const update = (): void => {
    const hold: BackgroundMusicHold = {
      testActive: sources.isTestActive(),
      raceActive: sources.isRaceActive(),
      documentHidden: sources.isDocumentHidden(),
    };
    backgroundMusic.setPlaybackSuspended(hold);
  };
  const disposeEffect = createRoot((dispose) => {
    createEffect(update);
    return dispose;
  });
  const unsubscribe = sources.subscribeVisibility(update);
  disposeHold = () => {
    unsubscribe();
    disposeEffect();
    disposeHold = undefined;
  };
}

/**
 * Arm the player after the app mounts. Never calls `play()` here.
 * The kids guide is a static page and, if this bundle ever ran there,
 * would get no listeners and no prompt.
 */
export function installBackgroundMusic(): void {
  if (teardown !== undefined) return;
  if (isKidsGuidePath(window.location.pathname)) {
    teardown = () => {
      teardown = undefined;
    };
    return;
  }
  const removeGestures = backgroundMusic.install(document);
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== BG_MUSIC_STORAGE_KEY) return;
    backgroundMusic.replace(readBgMusicSettings(event.newValue));
    publish();
  };
  window.addEventListener("storage", onStorage);
  teardown = () => {
    removeGestures();
    window.removeEventListener("storage", onStorage);
    teardown = undefined;
  };
}

export function uninstallBackgroundMusic(): void {
  teardown?.();
  disposeHold?.();
}
