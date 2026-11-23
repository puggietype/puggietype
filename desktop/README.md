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
npm run dist:linux:dev # dev installers (see "Installers (dev only)")
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
- `npm run package` is a Steam release build. **Only release cutters run it**: it creates and pushes a `steam-v<version>` tag to origin. Everyone else uses `--dev`. It refuses unless the tree is clean and HEAD is on `origin/main` (or is tagged on origin), then tags the build `steam-v<version>` on origin. Never delete those tags. `npm run package -- --dev` stages a local test build with no checks and no tag; never upload one. Output goes to `out/`: `out/app/` (package.json, src/, web/ = the steam build) and `out/legal/`. Both `out/legal/` and `out/app/web/legal/` hold the **GPL-3.0 bundle**: `LICENSE.txt`, `NOTICE.txt`, Electron's `ELECTRON-LICENSE.txt`, Chromium's `LICENSES.chromium.html`, `DLC-ASSETS-LICENSE.txt` (the supporter pack art licence, from `assets/supporter/LICENSE`; supporter pack art goes only in `assets/supporter/`) and `SOURCE.txt`, Legal's source offer naming the exact commit. The About screen (steam only) links to `app://puggietype/legal/*`, and those open in a sandboxed, preload-free viewer window. `stagePackage()` also runs the content depot allowlist on `out/` and deletes a tree that fails it. Installers: see below (dev only).
- **Depot scaffolding (not an upload):** SteamPipe templates live in `steam/` with placeholder ids only (no App ID yet); see `steam/README.md`. `scripts/depot-allowlist.mjs` limits the content depot to `out/app/` + `out/legal/` and the Supporter Pack DLC depot to its licence + image art; the held PR #37 helper and `steam_api` redistributables are rejected. `--dev` staging still uploads nothing; `npm run package` without `--dev` still tags and stays release-cutter only. No script runs the SteamPipe tools or uploads. Nothing is uploaded until Lead and Jake give an explicit go after real IDs exist and Legal re-reviews the depot contents.

## Installers (dev only)

electron-builder (exact pin in `package.json`, devDependency only) packages the `--dev` staged tree. Config: `electron-builder.config.cjs`. **Nothing is published or uploaded**: `publish: null`, every script passes `--publish never`, no auto-update.

```sh
npm run build:web         # if ../frontend/dist is missing or stale
npm run dist:linux:dev    # package.mjs --dev, then dir + AppImage (x64), then check-installer
```

- Input: `out/app` only (`package.json`, `src/`, `web/`) packed into `app.asar`; `out/legal` (the GPL-3.0 bundle) ships as `resources/legal/` next to it in every installer.
- Output: `dist-installers/` (gitignored): `linux-unpacked/` and `PuggieType-<version>-linux-x86_64.AppImage`.
- `scripts/check-installer.mjs` then checks the unpacked build against the depot rules: no ticket helper, `steam_api`, `steam_appid.txt` or `ads.txt` anywhere (tree or `app.asar`), `resources/legal/` = exactly `LEGAL_FILES`, `app.asar` holds only the staged app.
- Windows (`dist:win:dev`: nsis + dir, x64) and macOS (`dist:mac:dev`: dmg + dir, x64 + arm64) are configured and shape-tested only, **never built or run here**.
- **Unsigned.** No mac identity (`identity: null`, `notarize: false`), no Windows certificate. Code signing and notarization are later steps that need Jake (certs/credentials are never committed).
- Verified on Linux (Xvfb, 2026-11-23): Linux dir + AppImage build, the installer check, `npm run smoke`, and `PUGGIE_SMOKE_TEST=1 PUGGIE_SMOKE_DECK=<dir>` against both `linux-unpacked/puggietype` and the AppImage (`APPIMAGE_EXTRACT_AND_RUN=1`, no FUSE). **Not verified:** Windows/macOS builds, signing, the AppImage on other distros, and real Steam Deck hardware (game mode, a real controller).

### Steam Deck baseline (1280x800)

`PUGGIE_SMOKE_TEST=1 PUGGIE_SMOKE_DECK=<dir>` (also works on a packaged build; read-only apart from screenshots into `<dir>`) checks `/` and `/settings` at 1280x800: no horizontal overflow, `navigator.getGamepads` usable (not blocked by the permissions policy or CSP), and a fake D-pad walk (the settings smoke's `padWalk`) moves focus onto visible controls. On a 1280x800 display it goes fullscreen (as in Deck game mode); otherwise it sizes a 1280x800 window. Fullscreen needs a window manager: under bare Xvfb a 1280x800 screen gives a 1279x799 viewport, so use a bigger screen (`xvfb-run -s "-screen 0 1920x1080x24"`) or run a WM. Pure helpers in `src/deck.mjs`.

Gap: this is a baseline, not a controller UI. The frontend's D-pad navigation (`frontend/src/ts/steam/gamepad-nav.ts`) only walks focus; there is no on-screen keyboard handling, glyphs, or Steam Input config, and nothing was tried on a real Deck.
