import { createComputed, createRoot, createSignal } from "solid-js";

import { countdown, race } from "../multiplayer/store";
import { getFocus, isTestActive } from "../states/test";
import { ADS_BUILD_ENABLED, fetchAdsSwitch, isAdsKilledByFlags } from "./gate";
import { AdPrepareOptions, getAdProvider, setAdProvider } from "./provider";

/** both switches on and the provider loaded */
const [isAdsActive, setAdsActive] = createSignal(false);
export { isAdsActive };

/** a provider loaded ads at least once (consent done, script in) */
const [isAdsReady, setAdsReady] = createSignal(false);
export { isAdsReady };

/** class on <html> that hides every ad slot and the consent message */
export const ADS_SUPPRESSED_CLASS = "adsSuppressed";

/**
 * No ads (and no consent message) while a test runs, the test page is in
 * focus mode, or a multiplayer race (countdown, racing) owns the test page.
 */
export function isAdsSuppressed(): boolean {
  return (
    isTestActive() ||
    getFocus() ||
    race() !== undefined ||
    countdown() !== undefined
  );
}

/** hide every slot right now (test or race start), before anything renders */
export function suppressAdsNow(): void {
  if (!isAdsActive()) return;
  document.documentElement.classList.add(ADS_SUPPRESSED_CLASS);
}

let initPromise: Promise<void> | undefined;

/**
 * Turns ads on when the build flag, ?flags= and /config.json allow it. With
 * the build flag off this is empty and neither /config.json nor any ad
 * code is fetched.
 */
export async function initAds(): Promise<void> {
  initPromise ??= (async () => {
    // a literal env check, so builds without the flag drop the imports below
    if (import.meta.env.VITE_ADS_ENABLED !== "true" || !ADS_BUILD_ENABLED) {
      return;
    }
    if (isAdsKilledByFlags(window.location.search, sessionStorage)) return;
    if (!(await fetchAdsSwitch())) return;
    const provider =
      import.meta.env.VITE_ADS_PROVIDER === "placeholder"
        ? (await import("./placeholder")).placeholderAdProvider
        : (await import("./adsense")).adsenseProvider;
    setAdProvider(provider);
    setAdsActive(true);
  })();
  return initPromise;
}

/** run the provider's consent gate; false while suppressed or inactive */
export async function prepareAds(options: AdPrepareOptions): Promise<boolean> {
  if (!isAdsActive() || isAdsSuppressed()) return false;
  const ok = await getAdProvider().prepare(options);
  if (ok) setAdsReady(true);
  return ok;
}

createRoot(() => {
  // keeps the <html> class in sync, synchronously with the signals above
  createComputed(() => {
    document.documentElement.classList.toggle(
      ADS_SUPPRESSED_CLASS,
      isAdsActive() && isAdsSuppressed(),
    );
  });
});
