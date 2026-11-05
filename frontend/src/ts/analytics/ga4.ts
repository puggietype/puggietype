import { envConfig } from "virtual:env-config";

import { loadAds } from "../ads/excluded-paths";
import {
  analyticsLoadAllowed,
  DEFAULT_CONSENT_REGIONS,
  isGa4MeasurementId,
  readConsentRecord,
  readCountryCookie,
} from "./consent";

/** GA4 tag origin only. No ads, Google signals, or Ads linking endpoints. */
export const GA4_SCRIPT_URL = "https://www.googletagmanager.com/gtag/js";

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

function isSteam(): boolean {
  return typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam";
}

function gtag(...args: GtagValue[]): void {
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

/** Insert the GA4 tag once. Signals, ads personalization, and ads linking stay off. */
export function loadGa4(measurementId: string): void {
  if (!isGa4MeasurementId(measurementId)) return;
  if (loadedId === measurementId) return;
  if (typeof document === "undefined") return;
  const page = pageWindow();
  page.dataLayer = page.dataLayer ?? [];
  page.gtag = gtag;
  gtag("js", new Date());
  gtag("consent", "default", {
    ...ADS_DENIED,
    analytics_storage: "granted",
    functionality_storage: "denied",
    personalization_storage: "denied",
    security_storage: "granted",
  });
  gtag("set", "allow_google_signals", false);
  gtag("config", measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ads_data_redaction: true,
    send_page_view: true,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `${GA4_SCRIPT_URL}?id=${encodeURIComponent(measurementId)}`;
  script.dataset["ga4"] = measurementId;
  document.head.appendChild(script);
  loadedId = measurementId;
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

/** Load GA4 only when the measurement ID and the consent rules allow it. */
export function syncGa4(): void {
  loadAds(window.location.pathname);
  if (isSteam()) return;
  const measurementId = envConfig.ga4MeasurementId ?? "";
  const consent = readConsentRecord();
  const allowed = analyticsLoadAllowed({
    measurementId,
    country: readCountryCookie(document.cookie),
    analytics: consent?.analytics ?? null,
    consentRegions: envConfig.ga4ConsentRegions ?? [...DEFAULT_CONSENT_REGIONS],
  });
  if (!allowed) {
    denyAnalyticsStorage();
    return;
  }
  if (loadedId === measurementId) {
    grantAnalyticsStorage();
    return;
  }
  loadGa4(measurementId);
}
