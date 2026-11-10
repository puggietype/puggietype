# Font Awesome Free notices

`steam-asset-clearance.ts` copies `FontAwesome-Free-OFL.txt` and `FontAwesome-Free-MIT.txt` into the steam web root (`webfonts/licenses/`) when the subset fonts are emitted. These files are not under `frontend/static`, so the website build does not ship them.

- `SIL-OFL-1.1.txt` is the unchanged plaintext from https://openfontlicense.org/documents/OFL.txt. The shipped OFL notice uses `Copyright (c) Font Awesome` and the license body that starts at `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007`. It does not include that file's example copyright and Reserved Font Name header.
- `MIT-permission.txt` is the permission, notice-inclusion, and warranty text from https://opensource.org/license/mit (`#LicenseText`). The shipped MIT notice puts the two-line byline from Font Awesome 5.15.4 `scss/fontawesome.scss` lines 2–3 in front of that text.
- `FontAwesome-Free-LICENSE.txt` is not stored here. The plugin still copies `@fortawesome/fontawesome-free` `LICENSE.txt` unchanged.
