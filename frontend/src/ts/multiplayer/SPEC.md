# Multiplayer client (spec)

Client for the puggietype realtime server. Protocol: `puggietype-server/PROTOCOL.md`;
`protocol.ts` here is a copy of the server's `src/protocol.ts`.

## Objective

Private-lobby races with friends: create or join a lobby, set the race settings (host),
ready up, race on the same word list with live opponent carets, and see a podium.
Solo typing must keep working unchanged. Pug mode works during races.

## Scope

- 13+ age gate (`age-gate.ts`, `AgeGate.tsx`) on the first visit to `/race` or `/r/CODE`:
  confirm (stored in localStorage) or go back; no WebSocket before confirming, then
  `hello{ageConfirmed:true}`. Build flags `VITE_MULTIPLAYER`, `VITE_PUBLIC_MATCHES`, WS URL
  `VITE_WS_URL` (see `DEPLOY.md`).
- `/race` page: (nickname is server-assigned, shown with a reroll button in the lobby), Create room (Private by default; Open when Open Rooms is on), Join by code, "public match:
  coming soon" stub. `/r/CODE` auto-joins.
- Host kick (two clicks) per player in lobby and results; the kicked player gets a notice and
  lands on `/race`. The race page URL follows the room (`/r/CODE` in one, else `/race`).
- Lobby: code + copy invite link, players (colour dot, name, host crown, ready), Ready toggle,
  host settings (time 15/30/60/120 | words 10/25/50/100, punctuation, numbers, language),
  read-only for non-hosts, Start (host) enabled when ≥2 players and every non-host is ready.
- Race: `race:countdown` → apply room settings over local config (restored afterwards), feed the
  server words into the engine in order, synced 3-2-1 (clock offset = median-RTT sample of 5
  pings), input locked until `startAt`. `race:progress` at 10 Hz when changed. Opponent carets
  (colour `var(--oppN)`, name tag), toggle (UI, commandline, persisted config). Progress bars.
- Finish: `race:finish`, then on `race:results` a podium replaces the result screen: winner with
  the pug-winner frame, table (place, name, wpm, raw, acc, flagged), Rematch (host) / waiting,
  Leave. Results are never saved to the backend.
- Reconnect with the persisted `playerId` + `sessionToken` (sessionStorage).
- Server full (`capacity.ts`, `ServerFull.tsx`): socket refused (`server_full` + close 4503, legacy
  4002) or room cap (`SERVER_FULL` error with `retryAfterMs`, socket kept) on create / join / Quick
  Match → "We're full right now" panel on `/race` (`role=status`, countdown as `role=timer`),
  auto-retry after `retryAfterMs` (60 s default, clamped 1 s–10 min) + up to 3 s jitter, "Try now",
  "Practice solo while you wait" (`/`). No reconnect backoff while full (`connect()` is a no-op
  until `retryFull`); the refused create / join / queue:join is redone on retry. No error toast.
  Leaving the race page stops the wait. Copy lives in `FULL_TEXT`.

## Structure

| file | role |
| --- | --- |
| `protocol.ts` | wire types + zod (verbatim copy of the server's) |
| `clock.ts` | clock offset from ping samples, countdown seconds (pure) |
| `helpers.ts` | room codes, invite links, start rules, config mapping, progress diff/wpm, finish input (pure) |
| `caret-position.ts` | opponent caret mapping, smoothing, tag stacking (pure) |
| `client.ts` | WebSocket client: ping sync, hello, session in sessionStorage, reconnect, full (4503) |
| `capacity.ts` | server-full state: retry delay + jitter, countdown, auto-retry timer, copy |
| `store.ts` | Solid signals: connection, room, race, progress, results, caret toggle |
| `race.ts` | actions + engine glue: settings override/restore, countdown, input lock, progress loop, finish |
| `engine-hooks.ts` | dependency-free state the engine reads (race words, locks, finish callback) |
| `components/` | `RacePage` (home, lobby, waiting, podium), `RaceOverlay` + `OpponentCarets` + `RaceProgressBars` on the test page |

Engine hook points are kept small and marked `// multiplayer hook`.

## Testing

- vitest: protocol helpers, clock offset, progress diffing, caret mapping.
- Playwright `e2e/multiplayer.spec.ts` (`pnpm e2e`, `BASE_URL`, default `http://localhost:3000`):
  two contexts race, carets visible, podium, faster typist wins, rematch → lobby.

## Boundaries

- Always: frames referenced by filename, `data-testid` on interactive MP elements.
- Never: save MP results to the backend, persist the overridden race config.

## Known gaps

- Reloading mid-race resumes at the last position the server saw, on the race clock; the
  words before it are replayed as typed correctly (mistakes before the reload are lost).
  After finishing, a reload just waits for the results.
- Browser back mid-race asks to leave (confirm); closing/reloading the tab prompts too.
- Public matchmaking is a stub. Results are never saved.

## Dev

Server: `cd puggietype-server && pnpm start` (:2567, vite proxies `/ws`). E2E: `pnpm e2e` from
the repo root (`BASE_URL`, `SCREENS_DIR`).
