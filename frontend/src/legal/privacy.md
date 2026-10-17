# Privacy Policy: launch version

_Launch draft v1.3 for attorney review. Effective date: **October 17, 2026**. Replaces the body of `frontend/src/privacy-policy.html`. Before publishing, every statement must match the deployed build. Items marked **VERIFY** are listed under "Launch flags" in `risks.md`._

## Who we are
PuggieType is run by the PuggieType team. For any privacy question or request, email support@puggietype.com.
_[Drafting note, delete before publishing: GDPR Art. 13 requires the controller's identity and contact details, and an EU representative may be required under Art. 27. See `risks.md` R2.]_

## Solo typing tests
The solo typing test needs no account. Your settings, themes, custom text, tags and test results are stored only in your browser (localStorage). They never leave your device unless you export them yourself. Clearing your browser data deletes them. If you open the release notes, your browser fetches them from GitHub's public API, which receives your IP address.

## Multiplayer (private lobbies, ages 13+)
When you create or join a lobby, our game server at ws.puggietype.com processes:
- **a random nickname** that the server assigns (you can't type your own);
- **the lobby code** and lobby settings;
- **race data**: progress, speed, accuracy and results;
- **connection data**: your IP address (needed to connect you), and a random player ID and session token.

Your nickname and race data are shown only to the players in your lobby. Anyone with your lobby's invite link or code can join it while it is open. All of this is kept in the server's memory only while the lobby exists, plus a 20-second reconnect window if you drop. It is not saved to disk or a database, and it is deleted when the lobby closes. There is no chat, and players can't send each other messages.

Our game server does not write IP addresses, nicknames, lobby codes or race data to its logs. Its logs contain only startup messages and error reports. Our hosting providers keep their own technical logs, described below.

## Why we use this data (GDPR legal bases)
- To provide the typing test and the multiplayer races you ask for (Art. 6(1)(b), performance of a contract).
- To keep the service secure and prevent cheating and abuse (Art. 6(1)(f), legitimate interests).
- To comply with legal obligations (Art. 6(1)(c)).

## Service providers
- **Cloudflare, Inc.** hosts the website (Cloudflare Pages) and provides DNS and security.
- **Fly.io, Inc.** hosts the game server. **VERIFY:** the region isn't configured in the repository yet; state it here once it is chosen.

These providers process IP addresses and technical request data on our behalf, and may keep their own operational logs under their own retention policies. Cloudflare may set strictly necessary security cookies (such as `__cf_bm` or `cf_clearance`) to protect the site from bots and attacks. If we enable Cloudflare Web Analytics, it is cookieless and does not track you across sites. **VERIFY** in production which Cloudflare cookies and analytics are active.

## Cookies, analytics and error reporting
PuggieType does not use advertising or analytics cookies, and we do not sell or share personal information for cross-context behavioral advertising. **VERIFY (launch blocker):** this is true only once the inherited Monkeytype Sentry, Google Analytics, Firebase and ad code has been removed. Until then, accepting those cookie categories in the cookie banner would send data to third parties. If we later add analytics or error reporting, we will ask for your consent first, and you can change your choice at any time in Settings.

## Children
Multiplayer is only for users aged 13 and over. We do not knowingly collect personal information from children under 13. If a parent or guardian tells us at support@puggietype.com that a child under 13 used multiplayer, we will delete any information we hold. Because lobby data is deleted when the lobby closes, it is usually already gone.

## Your rights
Depending on where you live (for example under the EU or UK GDPR, or California's CCPA/CPRA), you may have the right to access, correct, delete or port your data, to object to or restrict its processing, and to complain to your data protection authority. We do not sell or share your personal information. We will not discriminate against you for exercising your rights. To make a request, email support@puggietype.com.

## Retention summary
| Data | How long we keep it |
|---|---|
| Solo settings and results | in your browser only, until you clear them |
| Nickname, lobby code, race data, IP address (game server) | in memory until the lobby closes, plus a 20-second reconnect window; never written to disk or logs |
| Game server logs | startup and error messages only; no personal data. Kept per Fly.io's log retention (**VERIFY**) |
| Cloudflare and Fly.io infrastructure logs | per each provider's own retention policy (**VERIFY**) |
| Emails you send us | as long as needed to answer you, then deleted |

## Changes
If we change this policy, we will update the effective date at the top of this page.
