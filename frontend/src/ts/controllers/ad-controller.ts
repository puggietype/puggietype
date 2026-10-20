import { suppressAdsNow } from "../ads/state";

/**
 * Ad slots are Solid components (components/ads) that fill on mount and
 * clear on unmount. The engine only needs to hide them the instant a test
 * or race starts; they come back when it's over (results, idle).
 */
export function onTestOrRaceStart(): void {
  suppressAdsNow();
}
