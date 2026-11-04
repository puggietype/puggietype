import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const draft = readFileSync(
  path.join(root, "docs/legal-drafts/privacy-steam-session-token.md"),
  "utf8",
);
const live = readFileSync(
  path.join(root, "frontend/src/legal/privacy.md"),
  "utf8",
);

// Legal, word for word (review 2026-11-04, section C)
const PRIVACY =
  "To keep you signed in, the Steam app stores a random sign-in token in your device's secure storage (such as Keychain, Windows DPAPI or your Linux keyring), and we keep a scrambled (hashed) copy linked to your Steam ID. It renews when you use the app and expires after 30 days of inactivity (and at most after 90 days). Signing out deletes it from your device and our server, and \"Delete my sign-in data\" in the app's settings deletes it on all your devices. If your device has no secure storage, nothing is kept and you sign in with Steam each time. It doesn't track you anywhere else.";
const RETENTION =
  "| Steam sign-in tokens | up to 30 days after last use (90 days maximum); deleted on sign-out or when you delete your sign-in data; expired tokens are removed within a day. |";

describe("Steam session token privacy copy", () => {
  it("the draft carries Legal's text verbatim, marked NOT LIVE", () => {
    expect(draft).toMatch(/^# .*\(NOT LIVE\)\n/);
    expect(draft).toContain(`> ${PRIVACY}\n`);
    expect(draft).toContain(`\n${RETENTION}\n`);
  });
  it("is not live while the feature is off (web privacy page unchanged)", () => {
    expect(live).not.toContain("sign-in token");
    // still the flag-off sentence; the draft lists its replacement
    expect(live).toContain(
      "Our server does not store or log your Steam ID or display name; it holds them in memory only while handling the sign-in request.",
    );
  });
});
