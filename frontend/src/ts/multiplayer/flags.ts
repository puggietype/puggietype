import { envFlag } from "./helpers";

/** build-time switches (Cloudflare Pages env vars), see DEPLOY.md */
export const MULTIPLAYER_ENABLED = envFlag(
  import.meta.env["VITE_MULTIPLAYER"] as string | undefined,
  true,
);
export const PUBLIC_MATCHES_ENABLED = envFlag(
  import.meta.env["VITE_PUBLIC_MATCHES"] as string | undefined,
  false,
);
export const CONFIGURED_WS_URL = import.meta.env["VITE_WS_URL"] as
  | string
  | undefined;
