# steam-ticket-helper (contract only)

The helper's source lives outside this repository and is not covered by this repository's licence.

This directory holds only the contract the desktop app expects. The helper
is a separate, proprietary program (see NOTICE, "Steam ticket helper"). It
ships, if at all, only as its own file in the Steam depot, never in the app,
the source releases or the web build. Do not add helper code, binaries or
Steamworks SDK files here (desktop/test/steam-helper-packaging.test.mjs checks).

## Contract

- Started by `desktop/src/main.mjs` only when the app runs on Steam **and**
  `PUGGIE_STEAM_SDK=1`, and only after the kept session token didn't work.
  Off by default. The app works fully without it.
- Location: packaged, `resources/steam-ticket-helper/steam-ticket-helper[.exe]`;
  dev, this directory (absent unless a developer puts a local build here; it is
  never committed).
- Independent process: no arguments, no shell, stdin closed, stderr ignored.
  No linking, shared libraries or other IPC.
- Prints one line on stdout: the one-time ticket as hex (16 to 2048 bytes),
  then exits 0.
- Anything else (non-zero exit, no output, extra lines, more than 16 KB, or no
  exit within 5 s, after which it is killed) means "no ticket": the app falls
  back to the Steam sign-in button.
- The ticket is sent once to `POST /steam/ticket` (server
  `FEATURE_STEAM_TICKET`, identity `puggietype`), never stored or logged.

Tests use `desktop/test/fixtures/fake-ticket-helper.mjs`, not a real helper.
