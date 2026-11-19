# Deploying the frontend (Cloudflare Pages)

Static build, no backend. Multiplayer talks to the separate WS server
(`puggietype-server`, Fly.io) at `wss://ws.puggietype.com/ws`.

## Pages project settings

| setting | value |
| --- | --- |
| Framework preset | None |
| Root directory | `/` (repo root, the pnpm workspace) |
| Build command | `pnpm build-fe` |
| Build output directory | `frontend/dist` |
| Node version | env `NODE_VERSION=24.11.0` (matches `.nvmrc`, engines `>=24 <25`) |
| pnpm | env `PNPM_VERSION=11.21.0` (matches `packageManager`) |

Pages installs dependencies itself (`pnpm install`, lockfile detected).

## Environment variables (build time)

Set them for **both** Production and Preview. All are optional.

| var | default | effect |
| --- | --- | --- |
| `VITE_WS_URL` | unset | WS endpoint, e.g. `wss://ws.puggietype.com/ws`. Unset: `wss://ws.puggietype.com/ws` on puggietype.com, same-origin `/ws` elsewhere (dev server, local preview, tunnels). **Set it on Pages** so `*.pages.dev` preview deploys reach the server too. Its origin is also put into the CSP `connect-src`. |
| `VITE_MULTIPLAYER` | on | `false` hides the race nav button and the `/race` page. |
| `VITE_PUBLIC_MATCHES` | off | off shows the "public match: coming soon" card. |
| `VITE_FLAGS` | unset (all on) | Client feature flags, all **on** by default: `characterSelect` (dog picker, dogs in lobby/podium/solo), `opponentDogs` (opponents' dogs in races). Set to a comma list to ship only those, or `none` to turn all off (build-time kill switch). Per tab: `?flags=characterSelect` limits to those, `?flags=none` turns all off, `?flags=default` clears (kept in sessionStorage). `characterSelect` also needs the WS server's `FEATURE_CHARACTER_SELECT=1`, else everyone stays Puggie (server off = picker off, safe). |
| `BACKEND_URL` | unset | leave unset: no accounts/API (standalone build). |
| `GA4_MEASUREMENT_ID` | empty | Optional GA4 measurement ID (`G-XXXXXXXX`). Empty: no GA4 script and no extra Google origins in the CSP. Signals, ads personalization, and Ads linking stay off. Set it only after the GA4 property exists. GA4 loads only after analytics accept, in every country, and never on the kids guides. |
| `VITE_FEATURE_ACCOUNTS` | off | `true` (exactly) turns on accounts sign-in (milestone A): `/login` sign-in page (email, Google) and a nav button. Off: the build drops all of it (no Firebase, no Turnstile, CSP unchanged). Not for prod until Legal copy, privacy and QA gates pass. |
| `VITE_ACCOUNTS_API_URL` | unset | PuggieType API base url (`https://`, required when accounts are on); sign-in calls `POST /v1/auth/session`. Its origin is added to the CSP `connect-src`. |
| `VITE_TURNSTILE_SITE_KEY` | empty | Cloudflare Turnstile site key (public). Empty: sign-in shows "not available yet". Cloudflare's test keys work on staging. |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | unset | Firebase web config (public, but set it on Pages, never commit it); required when accounts are on. Accounts on also adds Turnstile, `apis.google.com`, the auth domain and Google's auth APIs to the CSP. |

The WS server's Origin allowlist must include every host serving the frontend
(`https://puggietype.com`, `https://www.puggietype.com`, preview hosts if wanted).

## Routing and headers (`frontend/static`)

- `_redirects`: legacy 301s and SPA rewrites to `/`. On Pages, rules win over real
  files, so there is **no `/*` splat**; a rewrite to `/index.html` is dropped as an
  "infinite loop" (so it must be `/`). The build writes a top-level `404.html` (a copy of
  `index.html`), which turns Pages' SPA fallback **off**: unknown paths get the app's
  404 page with status 404, and a missing hashed `/js` or `/css` file is a 404, never
  `index.html` cached as JS for a year. Every router path must be listed here (a unit
  test checks it). Exception: accounts-only paths (`/account/action`) are appended to
  `dist/_redirects` at build time only when `VITE_FEATURE_ACCOUNTS=true`
  (`accountsRedirects` in `frontend/vite-plugins/accounts-env.ts`), so an off build's
  `_redirects` is unchanged.
- `_routes.json`: asset prefixes (`/js`, `/css`, `/webfonts`, `/assets`, `/images`, ...)
  are excluded so they never invoke the Pages Function (free plan quota). The
  middleware does www -> apex and HSTS. It does not set a country cookie. Real static files are served as-is.
- `_headers`: CSP (self, inline-script hashes, WS origin, poetrydb/wikipedia for those
  funboxes, `frame-ancestors 'none'`), `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`; one-year immutable cache for hashed
  `/js/*` and `/css/*`, `no-cache` for `version.json` and `sw.js`. The
  `__SCRIPT_HASHES__` / `__WS_ORIGIN__` placeholders are filled at build time by
  `frontend/vite-plugins/pages-headers.ts`. Adding a new external origin means
  editing the CSP there. The kids guides (`/guide/teaching-kids-to-type` and
  the `/guide/typing-for-kids` 301, with and without a trailing slash) detach
  that CSP and set one policy with no Analytics, Tag Manager, or ads hosts.
  Pages comma-joins two values of the same header, so a second CSP without
  the detach would keep the Google origins.

## Firebase setup for accounts

Only matters with `VITE_FEATURE_ACCOUNTS=true`. In the Firebase console of the
accounts project (staging and production each):

- **Authentication > Templates**: for **Password reset**, **Email address
  verification** and **Email address change**, edit the template, choose
  **Customize action URL** and set it to `https://puggietype.com/account/action`
  (staging: `https://<staging host>/account/action`). The setting is per project and
  applies to all three templates.
- Why: sign-up requires at least 8 characters (`frontend/src/ts/accounts/password.ts`),
  but Firebase's own hosted reset page only enforces the project's password policy
  (6 characters). Firebase can enforce a stronger policy itself only after the
  Identity Platform upgrade, which needs a billing account, so we don't use it.
  Our `/account/action` page checks the 8-character rule before calling
  `confirmPasswordReset`, and also handles email verification and email-change
  recovery. It reads only `mode` and `oobCode`, removes them from the address bar
  right away, and ignores `continueUrl`, `apiKey` and `lang` (no redirects).
- **Authentication > Settings > User actions**: keep **Email enumeration protection**
  on. The reset form already answers the same way whether or not an account exists.
- **Authentication > Settings > Authorized domains**: the production and staging hosts
  must be listed, or the action links are refused.

Check a build locally with Pages semantics:

```sh
npx wrangler pages dev frontend/dist --port 3300
curl -sI http://127.0.0.1:3300/r/ABCD2345   # 200, app
curl -sI http://127.0.0.1:3300/robots.txt   # 200, text/plain
```

## Local preview against a local WS server

Build without `VITE_WS_URL`, then `vite preview` proxies `/ws` to
`PUGGIE_WS_PROXY_TARGET` (default `ws://localhost:2567`):

```sh
cd frontend && pnpm exec vite build --outDir /tmp/pt-dist
PUGGIE_WS_PROXY_TARGET=ws://localhost:2600 pnpm exec vite preview --outDir /tmp/pt-dist --port 3200
```
