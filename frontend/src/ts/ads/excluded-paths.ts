import {
  isKidsGuidePath,
  KIDS_GUIDE_PATH,
  TEACHING_KIDS_GUIDE_PATH,
} from "../controllers/background-music";

/**
 * Kids guides, with or without a trailing slash. A future ads provider must
 * skip these paths. This module does not load an ads tag.
 */
export const ADS_EXCLUDED_PATHS = [
  KIDS_GUIDE_PATH,
  TEACHING_KIDS_GUIDE_PATH,
] as const;

export function isAdsExcludedPath(pathname: string): boolean {
  return isKidsGuidePath(pathname);
}

/** Ad inventory is off. This module never inserts an advertising script. */
export function adsEnabled(): boolean {
  return false;
}

export function adsAllowedOnPath(pathname: string): boolean {
  if (isAdsExcludedPath(pathname)) return false;
  return adsEnabled();
}

/**
 * Ads entry point. Returns without inserting a script. Kids guides are
 * excluded for when a provider exists; until then every path is off.
 */
export function loadAds(pathname: string): void {
  if (!adsAllowedOnPath(pathname)) return;
}
