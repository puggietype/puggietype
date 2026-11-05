import { z } from "zod";

/** Must match `COUNTRY_COOKIE` in `functions/_middleware.ts`. */
export const COUNTRY_COOKIE = "pt_country";

export const CONSENT_STORAGE_KEY = "acceptedCookies";

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

/**
 * Consent regions (EEA/UK/CH, plus any configured extras) and an unknown
 * country wait for analytics accept. Elsewhere, including the US, a configured
 * measurement ID may load until the visitor rejects. Reject always blocks.
 * Advertising purposes are not an input: they stay off.
 */
export function analyticsLoadAllowed(input: {
  measurementId: string;
  country: string | null;
  analytics: boolean | null;
  consentRegions: readonly string[];
}): boolean {
  if (!isGa4MeasurementId(input.measurementId)) return false;
  if (input.analytics === false) return false;
  const needsConsent =
    input.country === null || input.consentRegions.includes(input.country);
  if (needsConsent) return input.analytics === true;
  return true;
}
