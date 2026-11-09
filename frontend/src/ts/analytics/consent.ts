import { z } from "zod";

import { isAdsExcludedPath } from "../ads/excluded-paths";
import { isKidsGuidePath } from "../controllers/background-music";

/** Must match `COUNTRY_COOKIE` in `functions/_middleware.ts`. */
export const COUNTRY_COOKIE = "pt_country";

export const CONSENT_STORAGE_KEY = "acceptedCookies";

/**
 * First-layer disclosure. Sighted users must be able to read all of it.
 * Extra detail stays behind more options.
 */
export const CONSENT_ESSENTIAL_COPY =
  "Optional Google Analytics 4 measures site use. It loads only if you accept; rejecting keeps it off.";

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cssZoom(): number {
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

/**
 * EEA, UK (Cloudflare uses GB), and Switzerland. Extra ISO codes come from
 * `GA4_CONSENT_REGIONS` at build time.
 */
export const DEFAULT_CONSENT_REGIONS = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "GB",
  "CH",
] as const;

const UNKNOWN_COUNTRY = new Set(["XX", "T1"]);

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

export function normalizeCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  const code = trimmed === "UK" ? "GB" : trimmed;
  if (!/^[A-Z]{2}$/.test(code)) return null;
  if (UNKNOWN_COUNTRY.has(code)) return null;
  return code;
}

export function consentRegionList(extra: string | undefined): string[] {
  const regions = new Set<string>(DEFAULT_CONSENT_REGIONS);
  for (const part of (extra ?? "").split(",")) {
    const code = normalizeCountry(part);
    if (code !== null) regions.add(code);
  }
  return [...regions];
}

export function readCountryCookie(cookie: string): string | null {
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) !== COUNTRY_COOKIE) continue;
    return normalizeCountry(decodeURIComponent(trimmed.slice(eq + 1)));
  }
  return null;
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

export function writeConsentRecord(record: ConsentRecord): void {
  localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify(ConsentRecordSchema.parse(record)),
  );
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
