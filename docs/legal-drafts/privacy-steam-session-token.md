# Privacy policy: Steam session tokens (NOT LIVE)

Ships with the server's `FEATURE_STEAM_SESSION` (off by default). Per Legal's review of 2026-11-04, this must be on `/privacy` (`frontend/src/legal/privacy.md`) before, or at the moment, the flag turns on for any user, including a beta or a branch build pointed at prod. Copy is Legal's, word for word. The live page stays unchanged while the flag is off.

Under **Steam sign-in (desktop app)**, add:

> To keep you signed in, the Steam app stores a random sign-in token in your device's secure storage (such as Keychain, Windows DPAPI or your Linux keyring), and we keep a scrambled (hashed) copy linked to your Steam ID. It renews when you use the app and expires after 30 days of inactivity (and at most after 90 days). Signing out deletes it from your device and our server, and "Delete my sign-in data" in the app's settings deletes it on all your devices. If your device has no secure storage, nothing is kept and you sign in with Steam each time. It doesn't track you anywhere else.

In the **Retention summary** table, add this row:

| Steam sign-in tokens | up to 30 days after last use (90 days maximum); deleted on sign-out or when you delete your sign-in data; expired tokens are removed within a day. |

## Lines that stop being true when the flag is on

Legal asked that the Steam sign-in section be updated wherever it says Steam IDs aren't stored. Two places on the live page say so. Replace them in the same change that adds the text above. The wording below is ours and still needs Legal's sign-off.

1. In **Steam sign-in (desktop app)**, the sentence "Our server does not store or log your Steam ID or display name; it holds them in memory only while handling the sign-in request." becomes:

   > Our server never logs your Steam ID or display name and never stores your display name or what you own. While you stay signed in to the Steam app, it stores your Steam ID only together with the scrambled sign-in token described below; otherwise it holds your Steam ID in memory only while handling the sign-in request.

2. In the **Retention summary** table, the Steam row "| Steam ID, Steam ownership result and Steam display name (desktop app sign-in, on the game server) | in memory only while the sign-in request is handled; not written to disk, a database or logs |" becomes:

   | Steam ownership result and Steam display name (desktop app sign-in, on the game server) | in memory only while the sign-in request is handled; not written to disk, a database or logs |
   | Steam ID (desktop app sign-in, on the game server) | in memory only while the sign-in request is handled; if you stay signed in, stored with your sign-in token for as long as that token (see "Steam sign-in tokens"); never logged |

## New in-app strings (Steam build only)

Steam settings, sign-in section. The "Delete my sign-in data" strings are Legal's F3 set:

- Sign-in description while the server issues tokens (Legal F1): "Sign in with your Steam account. PuggieType receives your Steam ID, whether you own PuggieType and its supporter pack, and your Steam display name. To keep you signed in, we store your Steam ID with a scrambled sign-in token, never your name or what you own; see our privacy policy." The original description stays while the server issues none.
- Button: "Delete my sign-in data"
- Confirmation: "Delete your Steam sign-in data? This removes your sign-in from PuggieType's server on all your devices. Each device will need to sign in with Steam again the next time it starts PuggieType. Your settings and scores on this device are not affected."
- Confirm button: "Yes, delete it"
- Cancel button: "cancel"
- While deleting: "Deleting your sign-in data..."
- Done: "Your sign-in data was deleted. You're signed out."
- Token no longer accepted: "Your sign-in has expired. Sign in with Steam again, then delete your sign-in data."
- Error: "Couldn't delete your sign-in data. Check your connection and try again."
- Silent sign-in at launch: "Signing in with Steam..."
