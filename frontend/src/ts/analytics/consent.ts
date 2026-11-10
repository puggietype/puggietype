import { z } from "zod";

import { isAdsExcludedPath } from "../ads/excluded-paths";
import { isKidsGuidePath } from "../controllers/background-music";

export const CONSENT_STORAGE_KEY = "acceptedCookies";

/**
 * First-layer disclosure. Sighted users must be able to read all of it.
 * Extra detail stays behind more options.
 */
export const CONSENT_ESSENTIAL_COPY =
  "Optional Google Analytics 4 uses analytics cookies. It loads only if you accept; rejecting keeps it off.";

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function cssZoom(): number {
  const raw = Number.parseFloat(
    getComputedStyle(document.documentElement).zoom,
  );
  if (!finite(raw) || raw <= 0) {
    return 1;
  }
  return raw;
}

/**
 * Layout pixels that still fit in the visible viewport.
 * CSS zoom scales the box after max-height, so the cap is divided by that zoom.
 */
export function visibleViewportHeight(): number {
  const viewport = window.visualViewport;
  const rawHeight = viewport?.height;
  const rawOffset = viewport?.offsetTop;
  const height = finite(rawHeight) ? rawHeight : window.innerHeight;
  const offset = finite(rawOffset) ? rawOffset : 0;
  return Math.max(1, Math.floor((height - Math.max(0, offset)) / cssZoom()));
}

/** Keep a bottom-fixed bar on the visual viewport while pinch-zoomed. */
export function pinToVisualBottom(el: HTMLElement): void {
  const viewport = window.visualViewport;
  const rawTop = viewport?.offsetTop;
  const rawHeight = viewport?.height;
  if (!finite(rawTop) || !finite(rawHeight)) {
    el.style.bottom = "";
    return;
  }
  const inset = Math.max(
    0,
    Math.round(window.innerHeight - rawTop - rawHeight),
  );
  el.style.bottom = inset > 0 ? `${inset}px` : "";
}

/** Same session flag as leaderboards `KIDS_FLOW_KEY`. Read only. */
export const KIDS_FLOW_STORAGE_KEY = "puggie-kids-flow";

const ConsentRecordSchema = z
  .object({
    security: z.literal(true),
    analytics: z.boolean(),
    /** Saved for a later ads stack. Does not turn advertising purposes on. */
    doNotSellOrShare: z.boolean(),
  })
  .strict();

export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;

const GA4_MEASUREMENT_ID = /^G-[A-Z0-9]+$/;

export function isGa4MeasurementId(value: string): boolean {
  return GA4_MEASUREMENT_ID.test(value);
}

/** Empty stays empty. A non-empty value must look like `G-XXXXXXXX`. */
export function resolveGa4MeasurementId(raw: string | undefined): string {
  const id = (raw ?? "").trim();
  if (id === "") return "";
  if (!isGa4MeasurementId(id)) {
    throw new Error(
      `GA4_MEASUREMENT_ID must look like G-XXXXXXXX (got ${JSON.stringify(id)})`,
    );
  }
  return id;
}

export function readConsentRecord(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    const result = ConsentRecordSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const GA_COOKIE_EXPIRED = "Thu, 01 Jan 1970 00:00:00 GMT";

/** `_ga` and `_ga_*` only. Other first-party names stay put. */
export function gaCookieNames(cookieHeader: string): string[] {
  const names: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    const name = (eq === -1 ? part : part.slice(0, eq)).trim();
    if (name === "_ga" || name.startsWith("_ga_")) names.push(name);
  }
  return names;
}

/**
 * Leading-dot registrable domain (`www.puggietype.com` → `.puggietype.com`).
 * Host-only names (localhost, IPs) have none.
 */
export function registrableCookieDomain(hostname: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (host === "" || host === "localhost" || host.endsWith(".localhost")) {
    return null;
  }
  if (host.startsWith("[") || host.includes(":")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  const labels = host.split(".");
  if (labels.length < 2 || labels.some((label) => label === "")) return null;
  return `.${labels.slice(-2).join(".")}`;
}

/** Host-only expiry, plus the registrable domain when the host has one. */
export function gaCookieExpiryLines(
  name: string,
  hostname: string,
  protocol: string,
): string[] {
  const secure = protocol === "https:" ? "; Secure" : "";
  const hostOnly = `${name}=; expires=${GA_COOKIE_EXPIRED}; Max-Age=0; path=/; SameSite=Lax${secure}`;
  const domain = registrableCookieDomain(hostname);
  if (domain === null) return [hostOnly];
  return [hostOnly, `${hostOnly}; domain=${domain}`];
}

function readCookieHeader(): string {
  try {
    return document.cookie;
  } catch {
    return "";
  }
}

function readHostname(): string {
  try {
    return location.hostname;
  } catch {
    return "";
  }
}

function readProtocol(): string {
  try {
    return location.protocol;
  } catch {
    return "";
  }
}

/**
 * Best-effort delete of first-party `_ga` and `_ga_*` cookies.
 * Expires each one on the current host and, when there is one, on the
 * registrable domain (for example `.puggietype.com`), path `/`.
 */
export function deleteGaCookies(input?: {
  cookieHeader?: string;
  hostname?: string;
  protocol?: string;
  write?: (value: string) => void;
}): void {
  const header = input?.cookieHeader ?? readCookieHeader();
  const hostname = input?.hostname ?? readHostname();
  const protocol = input?.protocol ?? readProtocol();
  const write =
    input?.write ??
    ((value: string): void => {
      document.cookie = value;
    });
  for (const name of gaCookieNames(header)) {
    for (const line of gaCookieExpiryLines(name, hostname, protocol)) {
      try {
        write(line);
      } catch {
        // best effort: a blocked cookie jar still leaves consent withdrawn
      }
    }
  }
}

function analyticsConsentWithdrawn(
  previous: ConsentRecord | null,
  next: ConsentRecord,
): boolean {
  return previous?.analytics === true && !next.analytics;
}

export function writeConsentRecord(record: ConsentRecord): void {
  const previous = readConsentRecord();
  const next = ConsentRecordSchema.parse(record);
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(next));
  if (analyticsConsentWithdrawn(previous, next)) deleteGaCookies();
}

export function globalPrivacyControl(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true;
}

export function consentBannerAllowed(input: {
  testActive: boolean;
  raceActive: boolean;
}): boolean {
  return !input.testActive && !input.raceActive;
}

function referrerPath(referrer: string): string {
  if (referrer === "") return "";
  try {
    return new URL(referrer).pathname;
  } catch {
    return "";
  }
}

function kidsPath(pathname: string): boolean {
  return isKidsGuidePath(pathname) || isAdsExcludedPath(pathname);
}

export function readKidsFlow(
  storage: Pick<Storage, "getItem"> | undefined,
): boolean {
  if (storage === undefined) return false;
  try {
    return storage.getItem(KIDS_FLOW_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Kids guide slugs (with or without a trailing slash), a visit that arrived
 * from one, or a kids-flow session. Accepting analytics does not override this.
 */
export function kidsAnalyticsExcluded(input: {
  pathname: string;
  referrer?: string;
  kidsFlow?: boolean;
}): boolean {
  if (kidsPath(input.pathname)) return true;
  const from = referrerPath(input.referrer ?? "");
  if (from !== "" && kidsPath(from)) return true;
  return input.kidsFlow === true;
}

/**
 * Persist kids-flow before any banner or GA decision. A kids slug, or a
 * referrer that is one, marks the rest of the browser session.
 */
export function noteKidsFlowVisit(input: {
  pathname: string;
  referrer?: string;
  storage: Pick<Storage, "getItem" | "setItem">;
}): boolean {
  const excluded = kidsAnalyticsExcluded({
    pathname: input.pathname,
    referrer: input.referrer,
    kidsFlow: readKidsFlow(input.storage),
  });
  if (!excluded) return false;
  try {
    input.storage.setItem(KIDS_FLOW_STORAGE_KEY, "1");
  } catch {
    // storage blocked: this navigation is still excluded via path or referrer
  }
  return true;
}

/**
 * GA4 loads only after an explicit analytics accept, in every country.
 * Reject, no choice yet, and kids paths never load it.
 */
export function analyticsLoadAllowed(input: {
  measurementId: string;
  analytics: boolean | null;
  kidsExcluded: boolean;
}): boolean {
  if (input.kidsExcluded) return false;
  if (!isGa4MeasurementId(input.measurementId)) return false;
  return input.analytics === true;
}
