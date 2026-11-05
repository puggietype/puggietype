import { createEffect, createRoot } from "solid-js";

import { getAcceptedCookies } from "../cookies";
import { isRaceActive } from "../multiplayer/engine-hooks";
import { hideModal, isModalOpen, showModal } from "../states/modals";
import { isTestActive } from "../states/test";
import {
  consentBannerAllowed,
  kidsAnalyticsExcluded,
  readKidsFlow,
} from "./consent";
import { syncGa4 } from "./ga4";

function kidsBlocked(): boolean {
  return kidsAnalyticsExcluded({
    pathname: window.location.pathname,
    referrer: document.referrer,
    kidsFlow: readKidsFlow(sessionStorage),
  });
}

/**
 * Show the cookie banner only when no typing test or race is active.
 * Hides it if one starts, and shows it again afterward when no choice is saved.
 */
export function installAnalyticsConsent(): void {
  createRoot(() => {
    createEffect(() => {
      const open = isModalOpen("Cookies");
      if (kidsBlocked()) {
        if (open) hideModal("Cookies");
        syncGa4();
        return;
      }
      const allowed = consentBannerAllowed({
        testActive: isTestActive(),
        raceActive: isRaceActive(),
      });
      const consent = getAcceptedCookies();
      if (!allowed) {
        if (open) hideModal("Cookies");
      } else if (consent === null && !open) {
        showModal("Cookies");
      }
      syncGa4();
    });
  });
}

/** Footer control. No-op during an active test or race. */
export function openConsentSettings(): void {
  if (kidsBlocked()) return;
  if (
    !consentBannerAllowed({
      testActive: isTestActive(),
      raceActive: isRaceActive(),
    })
  ) {
    return;
  }
  showModal("Cookies");
}
