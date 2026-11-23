# SteamPipe depot scaffolding (not an upload)

Templates for a future SteamPipe build. **Placeholders only: there is no App ID yet.** Nothing may be uploaded until Lead and Jake give an explicit go after real IDs exist, and Legal has re-reviewed the depot contents.

| file                         | what                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `app_build.vdf.template`     | app build: `Preview "1"` (scan only), `SetLive ""` (never goes live by itself)  |
| `depot_content.vdf.template` | content depot, root `desktop/out/`: maps only `app/*` and `legal/*`             |
| `depot_dlc.vdf.template`     | Supporter Pack DLC depot, root `assets/supporter/`: licence + png/jpg/jpeg/webp/gif art into `supporter/` |

Placeholders: `__PUGGIE_STEAM_APP_ID__`, `__PUGGIE_STEAM_DEPOT_CONTENT_ID__`, `__PUGGIE_STEAM_DEPOT_DLC_ID__`. Never commit a real id.

`node scripts/render-steam-vdf.mjs` writes `steam/build/*.vdf` (gitignored) from env (`PUGGIE_STEAM_APP_ID`, `PUGGIE_STEAM_DEPOT_CONTENT_ID`, `PUGGIE_STEAM_DEPOT_DLC_ID`) or `steam/ids.local.json` (gitignored). It refuses empty, non-digit, zero or duplicate ids, leftover placeholders, and templates that fail the allowlist. It only writes files: it never runs the SteamPipe tools or uploads. There is no npm script for it.

## Depot allowlist (Legal control)

`scripts/depot-allowlist.mjs` (tests: `test/depot-allowlist.test.mjs`) is the control Legal asked for (note of 2026-11-04: "depot allowlist and redistributables re-review when the depot step lands"). `stagePackage()` runs the content check on every staged `out/` and deletes a tree that fails.

- Content depot: only `app/**` and `legal/`; `legal/` holds exactly `LEGAL_FILES` (from `src/shell.mjs`), all non-empty.
- DLC depot: only `LICENSE` / `LICENSE.txt` and png/jpg/jpeg/webp/gif art. No program code, Electron, helper or audio.
- Forbidden in every depot: `steam-ticket-helper(.exe)`, `(lib)steam_api(64).(dll|so|dylib|lib)`, `steam_appid.txt`, `ads.txt`, symlinks.
- The templates' `ContentRoot`, `LocalPath` and `DepotPath` are checked too: a `*` at the repo root, `..`, or a mapping outside these sets fails.

**On hold:** a TODO on the unmerged PR #37 branch put `resources/steam-ticket-helper/` and `steam_api` redistributables in the depot. That path is on hold (no Steamworks SDK, Legal ruling 2026-11-03), so the allowlist rejects those files. Allowing them, or any other redistributable, needs Legal's re-review first; Legal also re-reviews depot contents before any real upload.

Before a real upload (after the go): confirm in a `Preview "1"` build log that the `FileExclusion` patterns and the DLC image mappings match as intended.
