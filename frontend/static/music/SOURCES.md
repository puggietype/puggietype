# Background music sources (steam build only)

Every file in this folder must be listed here with a matching sha256
(checked by `__tests__/steam/music.spec.ts`). CC0 only, no
attribution required, nothing paid. The web build does not ship this folder.

| File | Title | Author | Source URL | File URL | Licence | Licence page | Retrieved | sha256 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sherwood.ogg | Sherwood | zesona | https://opengameart.org/content/sherwood | https://opengameart.org/sites/default/files/sherwood_0.ogg | CC0 1.0 | https://creativecommons.org/publicdomain/zero/1.0/ | 2026-11-04 | a7796c847682f5fd00041ffc0b0d71b67d95a41b4d6d914cd8e11bc37fe29a88 |
| calm-theme.ogg | calm theme | pebonius | https://opengameart.org/content/calm-theme | https://opengameart.org/sites/default/files/calm_theme.ogg | CC0 1.0 | https://creativecommons.org/publicdomain/zero/1.0/ | 2026-11-04 | 8a701a803f365c8fe1257b2e18276a7fa8b0d62a9af601f973d43ccf4e354705 |

Notes for Legal:

- Both pages list "License(s): CC0" and link the CC0 1.0 deed above.
- Credit is optional on both pages (Sherwood: "If you wish to credit me,
  use the name Chris Murphy."; calm theme: "if you want to credit me link
  to https://pebonius.itch.io/"). Both are credited on the steam build's
  About screen (`data-testid="music-credits"` in AboutPage.tsx).
- Files are byte-for-byte as downloaded; only renamed.
