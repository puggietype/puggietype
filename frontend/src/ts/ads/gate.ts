import { FLAGS_SESSION_KEY } from "../multiplayer/feature-flags";

/**
 * Ads need two switches: the build flag (VITE_ADS_ENABLED=true) and the
 * server switch (`{"ads": true}` in /config.json). The build flag is read
 * through a literal `import.meta.env.VITE_ADS_ENABLED` so the bundler drops
 * all ad code from builds without it. Not a feature flag: ?flags= can't
 * turn ads on, only ?flags=none turns them off.
 */
export const ADS_BUILD_ENABLED = import.meta.env.VITE_ADS_ENABLED === "true";

export const ADS_CONFIG_URL = "/config.json";

/** ?flags=none (this load or earlier in the tab) forces ads off */
export function isAdsKilledByFlags(
  search: string,
  storage: Pick<Storage, "getItem">,
): boolean {
  const param = new URLSearchParams(search).get("flags");
  if (param !== null) return param.trim() === "none";
  try {
    return storage.getItem(FLAGS_SESSION_KEY) === "none";
  } catch {
    return false;
  }
}

/** only a literal `"ads": true` turns ads on */
export function parseAdsSwitch(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>)["ads"] === true
  );
}

/** the server switch; any failure means off */
export async function fetchAdsSwitch(
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchFn(ADS_CONFIG_URL, { cache: "no-store" });
    if (!response.ok) return false;
    return parseAdsSwitch(await response.json());
  } catch {
    return false;
  }
}
