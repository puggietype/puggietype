import { resolveGa4MeasurementId } from "../src/ts/analytics/consent";

/**
 * GA4 origins for when a measurement ID is configured. Not an ads allowlist:
 * no doubleclick, googleadservices, fundingchoices, or Mediavine.
 */
export function ga4CspSources(
  raw: string | undefined,
): Record<string, string[]> | undefined {
  if (resolveGa4MeasurementId(raw) === "") return undefined;
  return {
    "script-src": ["https://www.googletagmanager.com"],
    "connect-src": [
      "https://www.google-analytics.com",
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      "https://*.googletagmanager.com",
    ],
  };
}

export function mergeCspSources(
  parts: Array<Record<string, string[]> | undefined>,
): Record<string, string[]> | undefined {
  const out: Record<string, string[]> = {};
  for (const part of parts) {
    if (part === undefined) continue;
    for (const [directive, values] of Object.entries(part)) {
      out[directive] = [...(out[directive] ?? []), ...values];
    }
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * Analytics, Tag Manager, and ads hosts. A source is blocked when its host
 * is one of these or a subdomain, including a `*.` wildcard label.
 * `https:` (scheme only) is not a host and is left alone.
 */
export const ANALYTICS_ADS_HOST_SUFFIXES = [
  "google-analytics.com",
  "analytics.google.com",
  "googletagmanager.com",
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
  "googletagservices.com",
  "fundingchoicesmessages.google.com",
  "adservice.google.com",
] as const;

const STRIP_DIRECTIVES = new Set(["script-src", "connect-src", "img-src"]);

export function isAnalyticsAdsSource(token: string): boolean {
  const match = /^https?:\/\/([^/\s]+)/i.exec(token);
  const host = match?.[1]?.toLowerCase().replace(/^\*\./, "");
  if (host === undefined || host === "") return false;
  return ANALYTICS_ADS_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/** Drops analytics/ads hosts from script-src, connect-src, and img-src. */
export function cspWithoutAnalyticsAds(policy: string): string {
  return policy
    .split(";")
    .map((part) => {
      const trimmed = part.trim();
      if (trimmed === "") return "";
      const tokens = trimmed.split(/\s+/);
      const directive = tokens[0] ?? "";
      if (!STRIP_DIRECTIVES.has(directive)) return trimmed;
      return tokens
        .filter((token, index) => index === 0 || !isAnalyticsAdsSource(token))
        .join(" ");
    })
    .filter((part) => part !== "")
    .join("; ");
}
