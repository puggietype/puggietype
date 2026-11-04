# Steam flavor (M1: platform seam)

PuggieType has two build flavors from one shared core:

| flavor | build                     | notes                                 |
| ------ | ------------------------- | ------------------------------------- |
| web    | `pnpm build-fe` (default) | unchanged browser site                |
| steam  | `PLATFORM=steam` build    | desktop flavor, no ads, no Steamworks |

In `frontend/`: `npm run build` (web) or `npm run build:steam`.

## How it works

- `frontend/vite.config.ts` reads `PLATFORM` (`web` | `steam`, unset = `web`,
  anything else fails the build) and defines `__PLATFORM__`.
- `frontend/src/ts/platform/` holds the adapter interface (`types.ts`):
  storage, window/fullscreen, input, identity, entitlements, plus
  `adsAllowed`. `web.ts` is the current browser behavior; `steam.ts` is an
  M1 stub. `getPlatform()` picks the adapter from `__PLATFORM__`.
- Wired today: fullscreen toggle (`utils/misc.ts`) and the ad provider
  (`ads/provider.ts` returns the no-op provider when `adsAllowed` is false).

## Hard rules (Legal ruling, 2026-11-03)

- No Steamworks SDK of any kind, in-process or as a helper.
- Identity: Steam OpenID; DLC ownership via the CheckAppOwnership Web API
  called from our private server only. The client never holds a publisher key.
- No ads in the steam flavor.
- Ship GPL source and Electron/Chromium licenses; About screen with credits,
  non-affiliation line and source link.
- DLC is new art only, all-rights-reserved under `assets/LICENSE`, in
  DLC-only depots.

## Milestones

- M1 (this): build define, adapter seam, tests, docs. No Electron.
- M2: Electron shell (offline solo, fullscreen, Steam Deck input).
- M3: Steam OpenID sign-in and server-side entitlement checks.
- Cross-play: web and steam share the same core and ws protocol; the ws
  handshake needs a protocol version field before mixed versions ship.
