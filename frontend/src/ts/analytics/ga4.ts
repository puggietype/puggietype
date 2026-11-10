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
 * Analytics and ads hosts. While withdrawn, every path on these hosts is
 * blocked. googletagmanager.com is separate so GET /gtag/js can still load.
 */
const GA_HOSTS_ALL_PATHS = [
  "google-analytics.com",
  "analytics.google.com",
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
];

const GA_BLOCKED_BODY = "ga-transport-blocked";

let gaTransportBlocked = false;
let gaTransportInstalled = false;
let gaTransportDrops = 0;
const xhrRequest = new WeakMap<
  XMLHttpRequest,
  { url: string; method: string }
>();

export function isGaTransportBlocked(): boolean {
  return gaTransportBlocked;
}

/** How many Google requests the gate has dropped. Tests use this. */
export function gaTransportDropCount(): number {
  return gaTransportDrops;
}

function hostUnder(host: string, root: string): boolean {
  return host === root || host.endsWith(`.${root}`);
}

function isGoogleSiteHost(host: string): boolean {
  return /^(?:www\.)?google\.(?:com|[a-z]{2}|[a-z]{2}\.[a-z]{2}|com\.[a-z]{2})$/i.test(
    host,
  );
}

function isCollectOrAdsPath(path: string): boolean {
  const normalized = path.replace(/\/{2,}/g, "/");
  return (
    normalized === "/g/collect" ||
    normalized.startsWith("/g/collect/") ||
    normalized === "/mp/collect" ||
    normalized.startsWith("/mp/collect/") ||
    normalized === "/j/collect" ||
    normalized.startsWith("/j/collect/") ||
    normalized === "/r/collect" ||
    normalized.startsWith("/r/collect/") ||
    normalized === "/collect" ||
    normalized.startsWith("/collect/") ||
    normalized === "/td" ||
    normalized.startsWith("/td/") ||
    normalized.startsWith("/ccm/") ||
    normalized.startsWith("/pagead/") ||
    normalized.startsWith("/ads/") ||
    normalized.startsWith("/rmkt/") ||
    normalized.startsWith("/measurement/")
  );
}

function isGtagScriptUrl(url: URL): boolean {
  const path = url.pathname.replace(/\/{2,}/g, "/");
  return (
    hostUnder(url.hostname.toLowerCase(), "googletagmanager.com") &&
    (path === "/gtag/js" || path.startsWith("/gtag/js/"))
  );
}

/**
 * While withdrawn, block analytics and ads hosts. GET /gtag/js stays open
 * so a later accept can still load the tag.
 *
 * A native fetch, sendBeacon, or setAttribute copied before this module
 * runs, or taken from another window, is not wrapped. sendBeacon added
 * only after this one-time install is not wrapped either. Markup parsed
 * from innerHTML and CSS url() loads do not go through these setters.
 */
function shouldBlockGaRequest(
  raw: string,
  channel: { method?: string; script?: boolean; allowGtagGet?: boolean },
): boolean {
  if (!gaTransportBlocked || raw === "") return false;
  let url: URL;
  try {
    url = new URL(raw, location.href);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/{2,}/g, "/");
  const method = (channel.method ?? "GET").toUpperCase();
  if (
    isGtagScriptUrl(url) &&
    method === "GET" &&
    (channel.script === true || channel.allowGtagGet === true)
  ) {
    return false;
  }
  if (GA_HOSTS_ALL_PATHS.some((root) => hostUnder(host, root))) return true;
  if (hostUnder(host, "googletagmanager.com")) return true;
  return isGoogleSiteHost(host) && isCollectOrAdsPath(path);
}

function dropGaRequest(): void {
  gaTransportDrops += 1;
}

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  return "";
}

function requestMethod(input: unknown, init?: RequestInit): string {
  if (typeof init?.method === "string" && init.method !== "") {
    return init.method.toUpperCase();
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function guardUrlProperty(
  prototype: object,
  property: "src" | "srcset",
  channel: { script?: boolean },
): void {
  const desc = Object.getOwnPropertyDescriptor(prototype, property);
  if (desc?.get === undefined || desc.set === undefined) return;
  const getValue = desc.get;
  const setValue = desc.set;
  Object.defineProperty(prototype, property, {
    configurable: true,
    enumerable: desc.enumerable,
    get(): string {
      return String(getValue.call(this));
    },
    set(value: string) {
      if (
        shouldBlockGaRequest(value, {
          method: "GET",
          script: channel.script,
        }) ||
        (property === "srcset" && srcsetBlocked(value))
      ) {
        dropGaRequest();
        return;
      }
      setValue.call(this, value);
    },
  });
}

function srcsetBlocked(value: string): boolean {
  return value.split(",").some((part) => {
    const candidate = part.trim().split(/\s+/)[0] ?? "";
    return (
      candidate !== "" && shouldBlockGaRequest(candidate, { method: "GET" })
    );
  });
}

function attributeBlocked(
  element: Element,
  name: string,
  value: string,
): boolean {
  const attr = name.toLowerCase();
  if (attr !== "src" && attr !== "srcset") return false;
  if (attr === "srcset") return srcsetBlocked(value);
  return shouldBlockGaRequest(value, {
    method: "GET",
    script: element instanceof HTMLScriptElement,
  });
}

/** Install once. Later withdraws only flip `gaTransportBlocked`. */
function installGaTransportGuards(): void {
  if (gaTransportInstalled || typeof window === "undefined") return;
  gaTransportInstalled = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (
      shouldBlockGaRequest(urlOf(input), {
        method: requestMethod(input, init),
        allowGtagGet: true,
      })
    ) {
      dropGaRequest();
      return new Response(GA_BLOCKED_BODY, { status: 200 });
    }
    return origFetch(input, init);
  };
  if (typeof navigator.sendBeacon === "function") {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = ((url: string | URL, data?: BodyInit | null) => {
      if (shouldBlockGaRequest(urlOf(url), { method: "POST" })) {
        dropGaRequest();
        return true;
      }
      return origBeacon(url, data);
    }) as typeof navigator.sendBeacon;
  }
  guardUrlProperty(HTMLImageElement.prototype, "src", {});
  guardUrlProperty(HTMLImageElement.prototype, "srcset", {});
  guardUrlProperty(HTMLScriptElement.prototype, "src", { script: true });
  const origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (
    this: Element,
    name: string,
    value: string,
  ): void {
    if (attributeBlocked(this, name, value)) {
      dropGaRequest();
      return;
    }
    origSetAttribute.call(this, name, value);
  };
  const origSetAttributeNS = Element.prototype.setAttributeNS;
  Element.prototype.setAttributeNS = function (
    this: Element,
    namespace: string | null,
    name: string,
    value: string,
  ): void {
    if (attributeBlocked(this, name, value)) {
      dropGaRequest();
      return;
    }
    origSetAttributeNS.call(this, namespace, name, value);
  };
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
    xhrRequest.set(this, { url: urlOf(url), method });
    origOpen.call(this, method, url, async ?? true, username, password);
  };
  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const pending = xhrRequest.get(this);
    if (
      pending !== undefined &&
      shouldBlockGaRequest(pending.url, {
        method: pending.method,
        allowGtagGet: true,
      })
    ) {
      dropGaRequest();
      return;
    }
    origSend.call(this, body);
  };
}

function blockGaTransport(): void {
  installGaTransportGuards();
  gaTransportBlocked = true;
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

installGaTransportGuards();
