# steam-ticket-helper (stub, no SDK code)

A small separate program that asks the running Steam client for a one-time
Web API auth ticket and prints it, so the desktop app can sign the player in
without the browser (OpenID) step. This directory holds only the contract;
the program itself needs the Valve Steamworks SDK, which is **not** in this
repository and must not be committed here.

## Contract (what the desktop app expects)

- Started by `desktop/src/main.mjs` only when the app runs on Steam **and**
  `PUGGIE_STEAM_SDK=1`. Off by default.
- Location: packaged, `resources/steam-ticket-helper/steam-ticket-helper[.exe]`;
  dev, this directory.
- No arguments, no shell, stdin closed, stderr ignored.
- Prints one line on stdout: the ticket as hex (16 to 2048 bytes), then exits 0.
- Anything else (non-zero exit, no output, extra lines, more than 16 KB, or
  no exit within 5 s, after which it is killed) means "no ticket": the app
  falls back to the kept session token, then the Steam sign-in button.
- The ticket is sent once to `POST /steam/ticket` (server
  `FEATURE_STEAM_TICKET`, identity `puggietype`), never stored or logged.

## Building

Needs a Steamworks partner login to download the SDK, so it is not built in
CI. The steps (`SteamAPI_Init`, `GetAuthTicketForWebApi("puggietype")`, wait
for `GetTicketForWebApiResponse_t`, print hex, `SteamAPI_Shutdown`) are to be
added once the SDK is available. Tests use
`desktop/test/fixtures/fake-ticket-helper.mjs` instead.
