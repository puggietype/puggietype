export const SITE_ORIGIN = "https://puggietype.com";

/** Production URL for a pathname, ignoring the current host and query. */
export function canonicalUrl(pathname: string): string {
  const path = pathname.replace(/\/+$/, "");
  return `${SITE_ORIGIN}${path === "" ? "/" : path}`;
}
