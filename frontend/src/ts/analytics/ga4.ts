import { envConfig } from "virtual:env-config";

import { loadAds } from "../ads/excluded-paths";
import {
  analyticsLoadAllowed,
  isGa4MeasurementId,
  noteKidsFlowVisit,
  readConsentRecord,
  setGaWithdrawalHooks,
} from "./consent";

/** GA4 tag origin only. No ads, Google signals, or Ads linking endpoints. */
export const GA4_SCRIPT_URL = "https://www.googletagmanager.com/gtag/js";

/** 395 days, about 13 months. GA4 cookie lifetime after accept. */
export const GA4_COOKIE_EXPIRES_SECONDS = 34128000;

type GtagValue = string | number | boolean | Date | Record<string, unknown>;
type Gtag = (...args: GtagValue[]) => void;
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: Gtag;
};

function pageWindow(): AnalyticsWindow {
  return window;
}

let loadedId: string | null = null;
/** Last pathname we actually sent. A repeat call for that path is not another hit. */
let lastSentPath: string | null = null;

function isSteam(): boolean {
  return typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam";
}

function configuredMeasurementId(): string {
  return envConfig.ga4MeasurementId ?? "";
}

/** Google's documented opt-out property: `window['ga-disable-G-XXXX']`. */
export function gaDisableKey(id: string): string {
  return `ga-disable-${id}`;
}

function flagMap(): Record<string, unknown> {
  return pageWindow() as AnalyticsWindow & Record<string, unknown>;
}

export function isGaCollectionDisabled(id: string): boolean {
  if (!isGa4MeasurementId(id)) return false;
  return flagMap()[gaDisableKey(id)] === true;
}

function setGaCollectionDisabled(id: string, disabled: boolean): void {
  if (!isGa4MeasurementId(id)) return;
  flagMap()[gaDisableKey(id)] = disabled;
}

function gtag(...args: GtagValue[]): void {
  // Consent updates still go through. Events and config do not, so a hit
  // cannot refresh or recreate `_ga` after the opt-out flag is set.
  if (
    isGaCollectionDisabled(configuredMeasurementId()) &&
    args[0] !== "consent"
  ) {
    return;
  }
  const page = pageWindow();
  page.dataLayer = page.dataLayer ?? [];
  page.dataLayer.push(args);
  page.gtag = gtag;
}

const ADS_DENIED = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const;

/** Path only. Query and hash can carry tokens (email, reset, Discord access_token). */
function cleanPage(): { page_path: string; page_location: string } {
  return {
    page_path: location.pathname,
    page_location: `${location.origin}${location.pathname}`,
  };
}

function sendPageView(id: string): void {
  if (!isGa4MeasurementId(id) || isGaCollectionDisabled(id)) return;
  const fields = cleanPage();
  if (fields.page_path === lastSentPath) return;
  const gtagFn = pageWindow().gtag;
  if (gtagFn === undefined) return;
  lastSentPath = fields.page_path;
  gtagFn("event", "page_view", {
    ...fields,
    send_to: id,
  });
}

/** Insert the GA4 tag once. Signals, ads personalization, and ads linking stay off. */
export function loadGa4(measurementId: string): void {
  if (!isGa4MeasurementId(measurementId)) return;
  if (isGaCollectionDisabled(measurementId)) return;
  if (loadedId === measurementId) return;
  if (typeof document === "undefined") return;
  const page = pageWindow();
  page.dataLayer = page.dataLayer ?? [];
  page.gtag = gtag;
  gtag("js", new Date());
  gtag("consent", "default", {
    ...ADS_DENIED,
    analytics_storage: "denied",
    functionality_storage: "denied",
    personalization_storage: "denied",
    security_storage: "granted",
  });
  gtag("consent", "update", {
    ...ADS_DENIED,
    analytics_storage: "granted",
  });
  gtag("set", "allow_google_signals", false);
  const pageFields = cleanPage();
  gtag("config", measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ads_data_redaction: true,
    send_page_view: false,
    cookie_expires: GA4_COOKIE_EXPIRES_SECONDS,
    ...pageFields,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `${GA4_SCRIPT_URL}?id=${encodeURIComponent(measurementId)}`;
  script.dataset["ga4"] = measurementId;
  document.head.appendChild(script);
  loadedId = measurementId;
  sendPageView(measurementId);
}

function denyAnalyticsStorage(): void {
  const gtagFn = pageWindow().gtag;
  if (gtagFn === undefined) return;
  gtagFn("consent", "update", {
    ...ADS_DENIED,
    analytics_storage: "denied",
  });
}

function grantAnalyticsStorage(): void {
  const gtagFn = pageWindow().gtag;
  if (gtagFn === undefined) return;
  gtagFn("consent", "update", {
    ...ADS_DENIED,
    analytics_storage: "granted",
  });
}

/** Load GA4 only after analytics accept, and never on kids paths or kids-flow. */
export function syncGa4(): void {
  loadAds(window.location.pathname);
  if (isSteam()) return;
  const measurementId = envConfig.ga4MeasurementId ?? "";
  const consent = readConsentRecord();
  const allowed = analyticsLoadAllowed({
    measurementId,
    analytics: consent?.analytics ?? null,
    kidsExcluded: noteKidsFlowVisit({
      pathname: window.location.pathname,
      referrer: document.referrer,
      storage: sessionStorage,
    }),
  });
  if (!allowed) {
    denyAnalyticsStorage();
    return;
  }
  // Same-tab accept after a withdrawal: clear the opt-out, then grant.
  setGaCollectionDisabled(measurementId, false);
  if (loadedId === measurementId) {
    grantAnalyticsStorage();
    return;
  }
  loadGa4(measurementId);
}

/**
 * SPA navigations. No page_view while the opt-out flag is set or analytics
 * is off, so a route change cannot send a hit or recreate `_ga` in this tab.
 */
export function onSpaRouteChange(): void {
  const id = configuredMeasurementId();
  if (!isGa4MeasurementId(id) || isGaCollectionDisabled(id) || isSteam()) {
    return;
  }
  const allowed = analyticsLoadAllowed({
    measurementId: id,
    analytics: readConsentRecord()?.analytics ?? null,
    kidsExcluded: noteKidsFlowVisit({
      pathname: window.location.pathname,
      referrer: document.referrer,
      storage: sessionStorage,
    }),
  });
  if (!allowed || loadedId !== id) return;
  sendPageView(id);
}

setGaWithdrawalHooks({
  beforeCookieDelete: () => {
    const id = configuredMeasurementId();
    setGaCollectionDisabled(id, true);
    const gtagFn = pageWindow().gtag;
    if (gtagFn === undefined) return;
    gtagFn("consent", "update", { analytics_storage: "denied" });
  },
  onReaccept: () => {
    setGaCollectionDisabled(configuredMeasurementId(), false);
  },
});
