// build-time ad switches (Cloudflare Pages env vars), see DEPLOY.md
// an interface: merges with vite/client's ImportMetaEnv
// oxlint-disable-next-line consistent-type-definitions
interface ImportMetaEnv {
  /** "true" builds the ad code in; anything else (or unset) leaves it out */
  readonly VITE_ADS_ENABLED?: string;
  /** "placeholder": grey boxes, no network (dev, tests, screenshots) */
  readonly VITE_ADS_PROVIDER?: string;
  readonly VITE_ADS_SLOT_RESULT?: string;
  readonly VITE_ADS_SLOT_RAIL?: string;
  readonly VITE_ADS_SLOT_LOBBY?: string;
  readonly VITE_ADS_SLOT_INFO?: string;
}
