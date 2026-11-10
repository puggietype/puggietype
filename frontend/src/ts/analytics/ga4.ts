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
 * Analytics and ads hosts, plus google.<tld> and every subdomain of these.
 * While withdrawn, every path on these hosts is blocked. The only exception
 * is a GET of /gtag/js on googletagmanager.com, so a later accept can load
 * the tag.
 */
const GOOGLE_HOST_ROOTS = [
  "google-analytics.com",
  "analytics.google.com",
  "googletagmanager.com",
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
];

let gaTransportBlocked = false;
let gaTransportInstalled = false;
const xhrRequest = new WeakMap<
  XMLHttpRequest,
  { url: string; method: string }
>();

export function isGaTransportBlocked(): boolean {
  return gaTransportBlocked;
}

function hostUnder(host: string, root: string): boolean {
  return host === root || host.endsWith(`.${root}`);
}

function isGoogleHost(host: string): boolean {
  if (GOOGLE_HOST_ROOTS.some((root) => hostUnder(host, root))) return true;
  return /(?:^|\.)google\.(?:com|[a-z]{2}|[a-z]{2}\.[a-z]{2}|com\.[a-z]{2})$/i.test(
    host,
  );
}

function isGtagScript(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const path = url.pathname.replace(/\/{2,}/g, "/");
  return (
    hostUnder(host, "googletagmanager.com") &&
    (path === "/gtag/js" || path.startsWith("/gtag/js/"))
  );
}

/**
 * While withdrawn, block every Google host. GET /gtag/js stays open.
 *
 * A native fetch, sendBeacon, or setAttribute copied before this module
 * runs, or taken from another window, is not wrapped. sendBeacon added
 * only after this one-time install is not wrapped either. Markup parsed
 * from innerHTML, CSS url(), and link href do not go through these setters.
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
  const protocol = url.protocol;
  const http =
    protocol === "http:" ||
    protocol === "https:" ||
    protocol === "ws:" ||
    protocol === "wss:";
  if (!http) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const method = (channel.method ?? "GET").toUpperCase();
  if (
    (protocol === "http:" || protocol === "https:") &&
    method === "GET" &&
    isGtagScript(url) &&
    (channel.script === true || channel.allowGtagGet === true)
  ) {
    return false;
  }
  return isGoogleHost(host);
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
  if (attr === "srcset") return srcsetBlocked(value);
  if (attr !== "src") return false;
  return shouldBlockGaRequest(value, {
    method: "GET",
    script: element instanceof HTMLScriptElement,
  });
}

function guardUrlProperty(
  prototype: object,
  property: "src" | "srcset",
  script: boolean,
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
      const blocked =
        property === "srcset"
          ? srcsetBlocked(value)
          : shouldBlockGaRequest(value, { method: "GET", script });
      if (blocked) return;
      setValue.call(this, value);
    },
  });
}

function prototypesWith(property: "src" | "srcset"): object[] {
  const names = [
    "HTMLImageElement",
    "HTMLScriptElement",
    "HTMLIFrameElement",
    "HTMLSourceElement",
    "HTMLAudioElement",
    "HTMLVideoElement",
    "HTMLEmbedElement",
    "HTMLInputElement",
    "HTMLTrackElement",
    "HTMLMediaElement",
  ];
  const windowRecord = window as unknown as Record<
    string,
    { prototype?: object } | undefined
  >;
  const found: object[] = [];
  for (const name of names) {
    const proto = windowRecord[name]?.prototype;
    if (proto === undefined || found.includes(proto)) continue;
    const desc = Object.getOwnPropertyDescriptor(proto, property);
    if (desc?.get !== undefined && desc.set !== undefined) found.push(proto);
  }
  return found;
}

function guardWebSocket(): void {
  const Orig = window.WebSocket;
  if (typeof Orig !== "function") return;
  function GuardingWebSocket(
    url: string | URL,
    protocols?: string | string[],
  ): WebSocket {
    if (shouldBlockGaRequest(urlOf(url), {})) {
      return Object.create(Orig.prototype) as WebSocket;
    }
    if (protocols === undefined) return new Orig(url);
    return new Orig(url, protocols);
  }
  GuardingWebSocket.prototype = Orig.prototype;
  Object.setPrototypeOf(GuardingWebSocket, Orig);
  window.WebSocket = GuardingWebSocket as unknown as typeof WebSocket;
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
      return new Response(null, { status: 200 });
    }
    return origFetch(input, init);
  };
  if (typeof navigator.sendBeacon === "function") {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = ((url: string | URL, data?: BodyInit | null) => {
      if (shouldBlockGaRequest(urlOf(url), { method: "POST" })) return true;
      return origBeacon(url, data);
    }) as typeof navigator.sendBeacon;
  }
  for (const proto of prototypesWith("src")) {
    guardUrlProperty(proto, "src", proto === HTMLScriptElement.prototype);
  }
  for (const proto of prototypesWith("srcset")) {
    guardUrlProperty(proto, "srcset", false);
  }
  const origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (
    this: Element,
    name: string,
    value: string,
  ): void {
    if (attributeBlocked(this, name, value)) return;
    origSetAttribute.call(this, name, value);
  };
  const origSetAttributeNS = Element.prototype.setAttributeNS;
  Element.prototype.setAttributeNS = function (
    this: Element,
    namespace: string | null,
    name: string,
    value: string,
  ): void {
    if (attributeBlocked(this, name, value)) return;
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
      return;
    }
    origSend.call(this, body);
  };
  guardWebSocket();
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

/** Referrer with the query and hash removed. Empty when the browser has none. */
function cleanReferrer(): string {
  if (document.referrer === "") return "";
  try {
    const url = new URL(document.referrer);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

/**
 * The real gtag.js sends its own page_view when it handles `js`, from the
 * document URL, before a later config is applied. `send_page_view: false`
 * and a query-free page_location have to already be on the model.
 */
function publishCleanPage(gtagFn: Gtag): void {
  const fields = cleanPage();
  gtagFn("set", {
    send_page_view: false,
    page_location: fields.page_location,
    page_referrer: cleanReferrer(),
  });
}

function sendPageView(id: string): void {
  if (!isGa4MeasurementId(id) || isGaCollectionDisabled(id)) return;
  const fields = cleanPage();
  if (fields.page_path === lastSentPath) return;
  const gtagFn = pageWindow().gtag;
  if (gtagFn === undefined) return;
  lastSentPath = fields.page_path;
  publishCleanPage(gtagFn);
  gtagFn("event", "page_view", {
    ...fields,
    page_referrer: cleanReferrer(),
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
  publishCleanPage(gtag);
  const pageFields = cleanPage();
  gtag("config", measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ads_data_redaction: true,
    send_page_view: false,
    cookie_expires: GA4_COOKIE_EXPIRES_SECONDS,
    ...pageFields,
    page_referrer: cleanReferrer(),
  });
  gtag("js", new Date());
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
