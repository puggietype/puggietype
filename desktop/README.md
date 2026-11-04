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
- True fullscreen: F11 or Alt+Enter, or the in-app fullscreen command.
- Packaging and Steam depots are later milestones.
