# Privacy policy: Steam session tokens (NOT LIVE)

Ships with the server's `FEATURE_STEAM_SESSION` (off by default). Per Legal's review of 2026-11-04, this must be on `/privacy` (`frontend/src/legal/privacy.md`) before, or at the moment, the flag turns on for any user, including a beta or a branch build pointed at prod. Copy is Legal's, word for word. The live page stays unchanged while the flag is off.

Under **Steam sign-in (desktop app)**, add:

> To keep you signed in, the Steam app stores a random sign-in token in your device's secure storage (such as Keychain, Windows DPAPI or your Linux keyring), and we keep a scrambled (hashed) copy linked to your Steam ID. It renews when you use the app and expires after 30 days of inactivity (and at most after 90 days). Signing out deletes it from your device and our server, and "Delete my sign-in data" in the app's settings deletes it on all your devices. If your device has no secure storage, nothing is kept and you sign in with Steam each time. It doesn't track you anywhere else.

In the **Retention summary** table, add this row (Legal's section B wording, server #10):

| Steam sign-in tokens | up to 30 days after last use (90 days maximum); deleted on sign-out or when you delete your sign-in data; expired tokens are removed within a day. Scrambled (hashed) copies of tokens that have already been used are kept, without your Steam ID, until they would have expired (at most 30 days) to detect stolen tokens, and are deleted with your sign-in data. |

## Lines that stop being true when the flag is on

Approved by Legal as amended (review of 2026-11-04, section A). The current lines are true while `FEATURE_STEAM_SESSION` is off, so the replacements go live in the same change as the token paragraph and row, with the flag flip or before it (never after). The wording is conditional ("If you stay signed in"), so it's true either way and may go live early. privacy.md:59 needs no change.

1. privacy.md:44, replace "Our server does not store or log your Steam ID or display name; it holds them in memory only while handling the sign-in request." with:

   > Our server never logs your Steam ID or display name, and never stores your display name or what you own. If you stay signed in to the Steam app, it stores your Steam ID together with the scrambled sign-in token described below; otherwise it holds your Steam ID in memory only while handling the sign-in request.

2. privacy.md:76, replace the row with these two rows:

   | Steam ownership result and Steam display name (desktop app sign-in, on the game server) | in memory only while the sign-in request is handled; not written to disk, a database or logs |
   | Steam ID (desktop app sign-in, on the game server) | in memory only while the sign-in request is handled; if you stay signed in, stored with your sign-in token for as long as that token is kept (see "Steam sign-in tokens"); never logged |

## New in-app strings (Steam build only)

Steam settings, sign-in section. The "Delete my sign-in data" strings are Legal's F3 set:

- Sign-in description while the server issues tokens (Legal F1): "Sign in with your Steam account. PuggieType receives your Steam ID, whether you own PuggieType and its supporter pack, and your Steam display name. To keep you signed in, we store your Steam ID with a scrambled sign-in token, never your name or what you own; see our privacy policy."
- Sign-in description on a device that can keep a token but hasn't been issued one yet (Legal C35-1): "Sign in with your Steam account. PuggieType receives your Steam ID, whether you own PuggieType and its supporter pack, and your Steam display name. If PuggieType keeps you signed in, we store your Steam ID with a scrambled sign-in token, never your name or what you own; see our privacy policy." The original description ("We don't store any of these") stays only where nothing can be kept (keep:false).
- Button: "Delete my sign-in data"
- Confirmation: "Delete your Steam sign-in data? This removes your sign-in from PuggieType's server on all your devices. Each device will need to sign in with Steam again the next time it starts PuggieType. Your settings and scores on this device are not affected."
- Confirm button: "Yes, delete it"
- Cancel button: "cancel"
- While deleting: "Deleting your sign-in data..."
- Done: "Your sign-in data was deleted. You're signed out."
- Token no longer accepted: "Your sign-in has expired. Sign in with Steam again, then delete your sign-in data."
- Error: "Couldn't delete your sign-in data. Check your connection and try again."
- Silent sign-in at launch: "Signing in with Steam..."
