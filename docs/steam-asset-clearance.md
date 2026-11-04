# Steam asset clearance (sounds and quotes)

Legal & Trust ruling, 2026-11-03 (`steam-gpl-paid-ruling-2026-11-03.md`): sounds need
verified provenance and song lyrics must not ship in the paid steam build. Only the
steam flavor (`PLATFORM=steam`, M1's `__PLATFORM__` define) is affected; web is unchanged
apart from the new About/credits lines.

## Sounds

Provenance: `frontend/static/sounds/SOURCES.md` (155 files: 2 TRACED, 153 UNTRACED).

Steam handling of UNTRACED packs (`src/ts/constants/sound-clearance.ts`):

- **build:** `vite-plugins/steam-asset-clearance.ts` deletes them from `dist/sounds`;
- **UI:** hidden from settings (`getVisibleOptions`) and the command line;
  the time warning setting is hidden (`isConfigKeyHidden`);
- **runtime:** playback and preview are no-ops, and untraced error sounds are never requested;
- **cross-play:** `migrateConfig` resets synced or imported web configs that select an
  excluded sound to `off` (`src/ts/steam/asset-clearance.ts`).

To clear a pack later, add its verified row to SOURCES.md and remove its id from the lists.

## Song-lyric quotes

The quote JSON has no tags or category fields, so lyrics are identified from the `source`
field only (`src/ts/constants/lyric-quotes.ts`):

1. **keyword:** the source contains "lyrics", "ft." or "feat." (a featured-artist credit).
   One book about lyric writing is excepted.
2. **artist:** the source has a credit part ("A - B", "A, B", "A by B") equal to a listed
   recording artist or musical (96 entries, e.g. Taylor Swift, Pink Floyd, Đen, Hamilton).
3. **title:** the whole source matches a listed song title (531 English entries). The list
   was built by reading every distinct English source (3,308) and, for generic titles
   ("Time", "Home", "She"), the quote text. Titles whose quotes read as prose (books, films)
   were left out.

Code quote "languages" (`code_*`, `docker_file`) are never filtered. The filter returns the
same quote objects, so the kept quotes' `source` fields are unchanged. Steam builds apply it
twice: the build output's `quotes/*.json` are rewritten without lyric quotes, and
`QuotesController` filters at load time.

**Result:** 895 of 15,828 quotes are dropped (english 873, vietnamese 15, romanian 5,
french 1, indonesian 1). By rule: title 710, artist 172, keyword 13. A test pins these numbers.

**Limits:** the method is biased toward dropping. A false positive only removes a quote from
the steam pool. Song lyrics credited only by an unlisted, unusual title, or in a language other
than English with no artist credit, can still slip through. Legal should spot-check
before release. A curated or public-domain quote set stays the safer long-term option.

## Credits

The About page (web and steam) adds:

- "email support@puggietype.com to report a quote" (Legal's takedown wording, mailto link);
- a quote credits line, `QUOTE_CREDITS_LINE` in `src/ts/constants/quote-credits.ts`.
  **This is a PLACEHOLDER**: the ruling memo has no credits wording for quotes. Legal needs
  to supply the exact line.
