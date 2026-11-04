import { createEffect, createRoot, createSignal } from "solid-js";

import "./reduced-motion.css";
import { isRaceActive } from "../multiplayer/engine-hooks";
import { getPlatform } from "../platform";
import { getDesktopBridge } from "../platform/desktop-bridge";
import { isTestActive } from "../states/test";
import { installGamepadNav } from "./gamepad-nav";
import { applyMasterVolume, installMasterGain, sfxGain } from "./master-gain";
import { SteamMusic, type MusicAudio } from "./music";
import {
  type AnimationQuality,
  defaultSteamSettings,
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

/** true once a display change needs a restart to fully apply */
const [restartRequired, setRestartRequired] = createSignal(false);
export const isRestartRequired = restartRequired;

function createAudio(): MusicAudio {
  const audio = new Audio();
  audio.preload = "none";
  // in the DOM (hidden, no controls) so it shows up with the page's media
  audio.hidden = true;
  audio.dataset["steamMusic"] = "";
  document.body.append(audio);
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

export function resetSteamSettings(): void {
  updateSteamSettings(() => defaultSteamSettings());
}

let nativeMatchMedia: typeof window.matchMedia | undefined;

/**
 * Animation quality. reduced: as if the system asked for reduced motion
 * (CSS class + matchMedia); off: also stops every CSS animation/transition.
 */
export function applyAnimationQuality(q: AnimationQuality): void {
  document.documentElement.classList.toggle("anim-off", q === "off");
  applyReducedMotion(q !== "full");
}

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
      // a plain object, not Object.create(real): MediaQueryList methods
      // throw "Illegal invocation" when called on anything else
      const real = native(query);
      const forced: MediaQueryList = {
        matches: true,
        media: query,
        onchange: null,
        addEventListener: real.addEventListener.bind(real),
        removeEventListener: real.removeEventListener.bind(real),
        // oxlint-disable-next-line typescript/no-deprecated -- part of the MediaQueryList shape; older code still calls it
        addListener: real.addListener.bind(real),
        // oxlint-disable-next-line typescript/no-deprecated -- as above
        removeListener: real.removeListener.bind(real),
        dispatchEvent: real.dispatchEvent.bind(real),
      };
      return forced;
    }
    return native(query);
  };
}

export function applyUiScale(scale: number): void {
  document.documentElement.style.setProperty("zoom", String(scale));
  document.documentElement.dataset["uiScale"] = String(scale);
}

/** brightness as a CSS filter on the page (1 = none) */
export function applyBrightness(b: number): void {
  const style = document.documentElement.style;
  if (b === 1) style.removeProperty("filter");
  else style.setProperty("filter", `brightness(${b})`);
  document.documentElement.dataset["brightness"] = String(b);
}

let fpsCap = 0;
let lastFrame = Number.NEGATIVE_INFINITY;
let rafInstalled = false;

/** true when a frame at time t may run under the current cap */
export function frameAllowed(t: number): boolean {
  if (fpsCap === 0 || t === lastFrame) return true;
  // 1ms slack so a 60Hz display isn't rounded down to 30 at a 60 cap
  if (t - lastFrame >= 1000 / fpsCap - 1) {
    lastFrame = t;
    return true;
  }
  return false;
}

/**
 * Frame-rate cap: requestAnimationFrame callbacks only run on frames the cap
 * allows (others are re-queued). 0 = unlimited (still bound by VSync when
 * it is on). Returned ids stay valid for cancelAnimationFrame.
 */
export function installFrameCap(target: {
  requestAnimationFrame: typeof requestAnimationFrame;
  cancelAnimationFrame: typeof cancelAnimationFrame;
}): void {
  if (rafInstalled) return;
  rafInstalled = true;
  const raf = target.requestAnimationFrame.bind(target);
  const caf = target.cancelAnimationFrame.bind(target);
  const live = new Map<number, number>();
  let nextId = 1;
  target.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = nextId++;
    const tick = (t: number): void => {
      if (frameAllowed(t)) {
        live.delete(id);
        cb(t);
      } else {
        live.set(id, raf(tick));
      }
    };
    live.set(id, raf(tick));
    return id;
  };
  target.cancelAnimationFrame = (id: number): void => {
    const native = live.get(id);
    if (native !== undefined) caf(native);
    live.delete(id);
  };
}

export function applyFrameCap(cap: number): void {
  fpsCap = cap;
  document.documentElement.dataset["fpsCap"] = String(cap);
}

let lastDisplay = "";

/** display mode / resolution / VSync go to the desktop shell (live) */
export function applyDisplay(s: SteamSettings, initial = false): void {
  const d = {
    displayMode: s.displayMode,
    resolution: s.resolution,
    vsync: s.vsync,
  };
  const key = JSON.stringify(d);
  if (key === lastDisplay) return;
  lastDisplay = key;
  // the shell already applied the stored display at launch
  if (initial) return;
  const r = getDesktopBridge()?.display?.apply(d);
  setRestartRequired(r?.restartRequired === true);
}

export { applyMasterVolume, installMasterGain, sfxGain } from "./master-gain";

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
  installFrameCap(window);
  installGamepadNav(window);
  let first = true;
  createRoot(() => {
    createEffect(() => {
      const s = settings();
      applyUiScale(s.uiScale);
      applyAnimationQuality(s.animation);
      applyBrightness(s.brightness);
      applyFrameCap(s.fpsCap);
      applyMasterVolume(sfxGain(s));
      applyDisplay(s, first);
      first = false;
      steamMusic.update(s);
    });
    createEffect(() => {
      steamMusic.setTyping(isTestActive() || isRaceActive());
    });
  });
}
