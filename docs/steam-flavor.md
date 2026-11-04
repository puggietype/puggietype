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
- M2: Electron shell in `desktop/` (see `desktop/README.md`): sandboxed renderer,
  `app://` scheme, preload bridge for fullscreen and storage, true fullscreen.
  The steam build always has an absolute ws URL (`VITE_WS_URL`, else
  `wss://ws.puggietype.com/ws`), used by both the race socket and the
  leaderboard base. Theme share links point at https://puggietype.com. The
  `ads` config is forced off and blocked.
- Protocol versioning (M2): `hello` sends `protocol`, `engine` (build id) and
  `platform`. The client only accepts `welcome.protocol` in its supported range;
  otherwise, or on the server's `upgrade_required` (close 4003), it stops
  reconnecting and tells the user to update (Steam or reload).
- Later: offline solo polish, Steam Deck input, packaging/depots.
- M3: Steam OpenID sign-in and server-side entitlement checks.
- Cross-play: web and steam share the same core and ws protocol; the server
  accepts a protocol range and a hello without `protocol` counts as 1.

## M3: Steam sign-in and ownership (draft, HOLD for Legal review)

- No Steamworks SDK. With `PUGGIE_STEAM_OPENID=1`, the shell exposes `puggieDesktop.steam.signIn()`. It opens Steam's OpenID 2.0 login page in the system browser, with `return_to` set to a one-shot listener on `http://127.0.0.1:<port>/steam/callback?state=<random>`.
- The shell checks the callback's path and state, then returns the `openid.*` fields. `signInWithSteam()` (frontend/src/ts/platform/steam-identity.ts) POSTs them to the game server's `/steam/auth`.
- The server (puggietype-server) checks the assertion, verifies it with Steam (`check_authentication`), then calls `ISteamUser/CheckAppOwnership` with the publisher key, which is read from the env and never committed.
- The Steam persona name is shown only if it passes the web username filter (`UserNameSchema`) and the player hasn't hidden it (`steamNameHidden`).
- Everything is off by default: there's no app id or key yet, and there's no UI entry point.
