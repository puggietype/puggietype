# PuggieType desktop shell (Steam flavor)

Plain Electron wrapper around the `PLATFORM=steam` web build. **No Steamworks
SDK, no ads.** Licensed GPL-3.0 like the rest of the repo.

```sh
cd desktop
npm install            # Electron only
npm run build:web      # PLATFORM=steam build into ../frontend/dist
npm start              # or PUGGIE_DIST=/path/to/dist npm start
npm test               # node --test, no Electron needed
npm run smoke          # loads the app, checks sandbox + bridge + fullscreen, exits 0/1
```

- The app is served from `app://puggietype/` (privileged, standard, secure scheme)
  so absolute asset paths and SPA routes work; requests cannot escape `dist`.
- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
  Only `app://puggietype` loads in the window; https/mailto links open in the OS browser.
- `src/preload.cjs` exposes `window.puggieDesktop` (v1): `fullscreen.{isFullscreen,toggle}`
  and `storage.{getItem,setItem,removeItem}` (JSON file in userData). The frontend's
  steam adapter (`frontend/src/ts/platform/steam.ts`) uses it when present.
- Every `app://` response carries a strict CSP (`buildCsp` in `src/shell.mjs`): `'self'` plus the build's inline-script hashes, `connect-src` limited to the ws server and its https twin (leaderboards), no eval, frames, plugins or remote images. Hashes and the ws origin are read from the steam build's rendered `_headers`.
- Permissions are denied by default (`setPermissionRequestHandler` / `setPermissionCheckHandler`); only `clipboard-sanitized-write` and `fullscreen` are allowed, and only for `app://puggietype`.
- True fullscreen: F11 or Alt+Enter, or the in-app fullscreen command.
- `npm run package` stages the app in `out/` from a clean tree: `out/app/` (package.json, src/, web/ = the steam build) and `out/legal/`. Both `out/legal/` and `out/app/web/legal/` hold the **GPL-3.0 bundle**: `LICENSE.txt`, `NOTICE.txt`, Electron's `ELECTRON-LICENSE.txt`, Chromium's `LICENSES.chromium.html` and `SOURCE.txt`, a source offer naming the exact commit. The About screen (steam only) links to `app://puggietype/legal/*`, and those open in a sandboxed, preload-free viewer window. Installers and Steam depots are later milestones.
