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
| `BACKEND_URL` | unset | leave unset: no accounts/API (standalone build). |

The WS server's Origin allowlist must include every host serving the frontend
(`https://puggietype.com`, `https://www.puggietype.com`, preview hosts if wanted).

## Routing and headers (`frontend/static`)

- `_redirects`: legacy 301s and SPA rewrites to `/`. On Pages, rules win over real
  files, so there is **no `/*` splat**; a rewrite to `/index.html` is dropped as an
  "infinite loop" (so it must be `/`). Unknown paths fall through to Pages' built-in
  SPA fallback, which is on because the build has **no top-level `404.html`** (the app
  renders its own 404 page). Real static files are served as-is.
- `_headers`: CSP (self, inline-script hashes, WS origin, poetrydb/wikipedia for those
  funboxes, `frame-ancestors 'none'`), `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`; one-year immutable cache for hashed
  `/js/*` and `/css/*`, `no-cache` for `version.json` and `sw.js`. The
  `__SCRIPT_HASHES__` / `__WS_ORIGIN__` placeholders are filled at build time by
  `frontend/vite-plugins/pages-headers.ts`. Adding a new external origin means
  editing the CSP there.

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
