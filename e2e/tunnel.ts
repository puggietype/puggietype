import type { BrowserContext } from "@playwright/test";

/**
 * When testing through a public ngrok URL, add ngrok's skip-interstitial
 * header to same-host requests only. Sending it cross-origin (GitHub API,
 * reCAPTCHA) would trigger CORS preflight failures real users never see.
 */
export async function skipNgrokWarning(ctx: BrowserContext): Promise<void> {
  await ctx.route(
    (url) =>
      url.hostname.endsWith(".ngrok-free.dev") ||
      url.hostname.endsWith(".ngrok-free.app"),
    async (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          "ngrok-skip-browser-warning": "1",
        },
      }),
  );
}
