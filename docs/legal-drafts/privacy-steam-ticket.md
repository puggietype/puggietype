# Privacy policy: Steam one-time ticket sign-in (NOT LIVE)

Ships with the server's `FEATURE_STEAM_TICKET` and the desktop app's
`PUGGIE_STEAM_SDK` (both off by default). Add to `/privacy`
(`frontend/src/legal/privacy.md`) under **Steam sign-in (desktop app)** before,
or when, either flag turns on for any user. The live page stays unchanged while
both are off.

> In the Steam app, we may sign you in automatically using a one-time ticket from the Steam client on your computer.

Notes for Legal: the ticket goes once to our server, which checks it with
Steam (`ISteamUserAuth/AuthenticateUserTicket`) to get the Steam ID; the ticket
itself is not stored or logged. After that, the same session-token text
(privacy-steam-session-token.md) applies.
