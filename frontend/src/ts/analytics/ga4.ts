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

/**
 * Hosts gtag.js uses for collect and ad pixels, plus www.google.com and
 * google.<tld>. A hit matches only when the path is a collect or ad path.
 */
const GA_COLLECT_ROOTS = [
  "google-analytics.com",
  "analytics.google.com",
  "googletagmanager.com",
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
];

let gaTransportBlocked = false;
let gaTransportInstalled = false;
const xhrUrl = new WeakMap<XMLHttpRequest, string>();

export function isGaTransportBlocked(): boolean {
  return gaTransportBlocked;
}

function hostUnder(host: string, root: string): boolean {
  return host === root || host.endsWith(`.${root}`);
}

function isGoogleSiteHost(host: string): boolean {
  return /^(?:www\.)?google\.(?:com|[a-z]{2}|[a-z]{2}\.[a-z]{2}|com\.[a-z]{2})$/i.test(
    host,
  );
}

function isGaCollectUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw, location.href);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const listed = GA_COLLECT_ROOTS.some((root) => hostUnder(host, root));
  if (!listed && !isGoogleSiteHost(host)) return false;
  const path = url.pathname;
  return (
    path === "/g/collect" ||
    path.startsWith("/g/collect/") ||
    path.startsWith("/ccm/") ||
    path.startsWith("/pagead/") ||
    path.startsWith("/ads/")
  );
}

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  return "";
}

function blockGaTransport(): void {
  gaTransportBlocked = true;
  if (gaTransportInstalled) return;
  gaTransportInstalled = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (gaTransportBlocked && isGaCollectUrl(urlOf(input))) {
      return new Response(null, { status: 200 });
    }
    return origFetch(input, init);
  };
  if (typeof navigator.sendBeacon === "function") {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = ((url: string | URL, data?: BodyInit | null) => {
      if (gaTransportBlocked && isGaCollectUrl(urlOf(url))) return true;
      return origBeacon(url, data);
    }) as typeof navigator.sendBeacon;
  }
  const src = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "src",
  );
  if (src?.get !== undefined && src.set !== undefined) {
    const getSrc = src.get;
    const setSrc = src.set;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      enumerable: src.enumerable,
      get(): string {
        return String(getSrc.call(this));
      },
      set(value: string) {
        if (gaTransportBlocked && isGaCollectUrl(value)) return;
        setSrc.call(this, value);
      },
    });
  }
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    xhrUrl.set(this, urlOf(url));
    origOpen.call(this, method, url, async ?? true, username, password);
  };
  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const url = xhrUrl.get(this);
    if (gaTransportBlocked && url !== undefined && isGaCollectUrl(url)) {
      return;
    }
    origSend.call(this, body);
  };
}

function gtag(...args: GtagValue[]): void;
// gtag.js only processes an Arguments object in dataLayer. A plain Array is ignored,
// so config, event, consent, and set would never reach the real library.
// eslint-disable-next-line prefer-rest-params
function gtag(): void {
  // eslint-disable-next-line prefer-rest-params
  const command = arguments[0] as unknown;
  // Consent updates still go through. Events and config do not, so a hit
  // cannot refresh or recreate `_ga` after the opt-out flag is set.
  if (
    isGaCollectionDisabled(configuredMeasurementId()) &&
    command !== "consent"
  ) {
    return;
  }
  const page = pageWindow();
  page.dataLayer = page.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  page.dataLayer.push(arguments);
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
    blockGaTransport();
    setGaCollectionDisabled(id, true);
    lastSentPath = null;
    const gtagFn = pageWindow().gtag;
    if (gtagFn === undefined) return;
    gtagFn("consent", "update", { analytics_storage: "denied" });
  },
  onReaccept: () => {
    gaTransportBlocked = false;
    setGaCollectionDisabled(configuredMeasurementId(), false);
  },
});
