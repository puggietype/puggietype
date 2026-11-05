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
