import type { Config } from "@monkeytype/schemas/configs";

import {
  isClickSoundExcluded,
  isErrorSoundExcluded,
  isTimeWarningExcluded,
  SoundPlatform,
} from "../constants/sound-clearance";
import { getPlatformName } from "../platform";

/**
 * Runtime side of the steam asset clearance: hides and disables sound options
 * whose files are left out of the steam build (see sound-clearance.ts).
 */
export function isSoundOptionHidden(
  key: string,
  option: unknown,
  platform: SoundPlatform = getPlatformName(),
): boolean {
  const value = String(option);
  if (value === "off") return false;
  if (key === "playSoundOnClick") return isClickSoundExcluded(value, platform);
  if (key === "playSoundOnError") return isErrorSoundExcluded(value, platform);
  if (key === "playTimeWarning") return isTimeWarningExcluded(platform);
  return false;
}

/**
 * Turns off sound settings a synced or imported (web) config may carry but
 * the steam build cannot play, so cross-play configs stay valid.
 */
export function resetExcludedSounds(
  config: Config,
  platform: SoundPlatform = getPlatformName(),
): Config {
  if (platform !== "steam") return config;
  const reset = { ...config };
  if (
    isSoundOptionHidden("playSoundOnClick", reset.playSoundOnClick, platform)
  ) {
    reset.playSoundOnClick = "off";
  }
  if (
    isSoundOptionHidden("playSoundOnError", reset.playSoundOnError, platform)
  ) {
    reset.playSoundOnError = "off";
  }
  if (isSoundOptionHidden("playTimeWarning", reset.playTimeWarning, platform)) {
    reset.playTimeWarning = "off";
  }
  return reset;
}
