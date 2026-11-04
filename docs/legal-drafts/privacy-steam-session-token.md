# Privacy policy: Steam session tokens (NOT LIVE)

Ships with the server's `FEATURE_STEAM_SESSION` (off by default). Do not add this to `frontend/src/legal/privacy.md` until Legal signs off and the flag is turned on. Copy is Legal's, word for word.

Under **Steam sign-in (desktop app)**, add:

> To keep you signed in, the Steam app stores a random sign-in token in your device's secure storage, and we keep a scrambled (hashed) copy linked to your Steam ID. It renews when you use the app and expires after 30 days of inactivity (and at most after 90 days). Signing out deletes it. It doesn't track you anywhere else.

In the **Retention summary** table, add this row:

| Steam sign-in tokens | up to 30 days after last use (90 days maximum), deleted on sign-out. |

(Legal's line: "Steam sign-in tokens: up to 30 days after last use (90 days maximum), deleted on sign-out.")

## New in-app strings (Steam build only, for Legal review)

Steam settings, sign-in section ("Delete my account", with a confirmation step):

- Button: "Delete my account"
- Confirmation: "Delete your account? This removes your Steam sign-in from PuggieType's server and signs you out on all your devices. It can't be undone."
- Confirm button: "Yes, delete my account"
- Cancel button: "cancel"
- While deleting: "Deleting your account..."
- Done: "Your account was deleted. You're signed out."
- Token no longer accepted: "Your sign-in has expired. Sign in with Steam again, then delete your account."
- Error: "Couldn't delete your account. Check your connection and try again."
- Silent sign-in at launch: "Signing in with Steam..."
