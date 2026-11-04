import { getPlatformName, type PlatformName } from "../platform";
import { envFlag, PRODUCTION_WS_URL } from "./helpers";

/** build-time switches (Cloudflare Pages env vars), see DEPLOY.md */
export const MULTIPLAYER_ENABLED = envFlag(
  import.meta.env["VITE_MULTIPLAYER"] as string | undefined,
  true,
);
export const PUBLIC_MATCHES_ENABLED = envFlag(
  import.meta.env["VITE_PUBLIC_MATCHES"] as string | undefined,
  false,
);
/**
 * The steam build has no same-origin server (it runs from local files), so it
 * always needs an absolute ws URL: VITE_WS_URL, else the production server.
 */
export function configuredWsUrl(
  env: string | undefined,
  platform: PlatformName,
): string | undefined {
  if (env !== undefined && env !== "") return env;
  return platform === "steam" ? PRODUCTION_WS_URL : undefined;
}

/** used by both the race socket and the leaderboard http base */
export const CONFIGURED_WS_URL = configuredWsUrl(
  import.meta.env["VITE_WS_URL"] as string | undefined,
  getPlatformName(),
);
