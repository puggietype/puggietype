DRAFT - NOT IN EFFECT. This is not PuggieType's privacy policy; the current policy is at https://puggietype.com/privacy.

# Privacy policy: Steam sign-in, variant B (NOT LIVE)

Source: Legal review 2026-11-04 (Ruling 5). Use this only when the server issues a session token. Until then, `frontend/src/legal/privacy.md` carries variant A. This file isn't rendered on the site.

Under **Steam sign-in (desktop app)**, replace the sentence "Our server does not store or log your Steam ID or display name; it holds them in memory only while handling the sign-in request." with:

> To keep you signed in, our server keeps your Steam ID and whether you own PuggieType and its supporter pack together with a random session token, in memory only, for up to 24 hours or until you sign out. [If persisted: We store your Steam ID and which supporter items you own in our database in <country> so your purchases unlock on every device; we delete it within 30 days if you ask us at support@puggietype.com.] Steam IDs, display names and session tokens are never written to our logs.

In the **Retention summary** table, replace the variant A Steam row with this row (Legal addendum 2026-11-04, item 3):

| Steam ID, Steam ownership result and Steam display name, with a random session token (desktop app sign-in, on the game server) | in memory only, for up to 24 hours or until you sign out, whichever is sooner; not written to disk, a database or logs. Lost if the server restarts |
