export const SITE_ORIGIN = "https://puggietype.com";

/** Production URL for a pathname, ignoring the current host and query. */
export function canonicalUrl(pathname: string): string {
  const path = pathname.replace(/\/+$/, "");
  return `${SITE_ORIGIN}${path === "" ? "/" : path}`;
}

/**
 * Origin for links people share (e.g. a custom theme). The steam build runs
 * from local files, so its links must point at the website instead.
 */
export function shareOrigin(
  platform: "web" | "steam",
  locationOrigin: string,
): string {
  return platform === "steam" ? SITE_ORIGIN : locationOrigin;
}
