/**
 * Steam asset clearance for sound effects (see frontend/static/sounds/SOURCES.md).
 *
 * Every wav in static/sounds came from the upstream fork. A pack is only
 * "cleared" when its original author and licence could be traced in the
 * upstream history; everything else is UNTRACED and is left out of the steam
 * build (files dropped at build time, options hidden, playback disabled).
 *
 * Kept free of runtime imports so vite.config.ts can read the same lists.
 */

/** click packs backed by wav files that could not be traced (all of them) */
export const UNTRACED_CLICK_SOUNDS: readonly string[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
];

/** error sounds that could not be traced ("2" and "3" are contributor-synthesized) */
export const UNTRACED_ERROR_SOUNDS: readonly string[] = ["1", "4"];

/** single-file sounds that could not be traced */
export const UNTRACED_SINGLE_SOUNDS = {
  timeWarning: "timeWarning.wav",
  fartReverb: "fart-reverb.wav",
} as const;

/** static/sounds paths (relative to the sounds dir) removed from the steam build */
export function steamExcludedSoundPaths(): string[] {
  return [
    ...UNTRACED_CLICK_SOUNDS.map((id) => `click${id}`),
    ...UNTRACED_ERROR_SOUNDS.map((id) => `error${id}`),
    ...Object.values(UNTRACED_SINGLE_SOUNDS),
  ];
}

export type SoundPlatform = "web" | "steam";

export function isClickSoundExcluded(
  id: string,
  platform: SoundPlatform,
): boolean {
  return platform === "steam" && UNTRACED_CLICK_SOUNDS.includes(id);
}

export function isErrorSoundExcluded(
  id: string,
  platform: SoundPlatform,
): boolean {
  return platform === "steam" && UNTRACED_ERROR_SOUNDS.includes(id);
}

/** timeWarning.wav is untraced, so the time warning setting is steam-hidden */
export function isTimeWarningExcluded(platform: SoundPlatform): boolean {
  return platform === "steam";
}

export function isFartReverbExcluded(platform: SoundPlatform): boolean {
  return platform === "steam";
}
