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

// Legal, word for word
const PRIVACY =
  "To keep you signed in, the Steam app stores a random sign-in token in your device's secure storage, and we keep a scrambled (hashed) copy linked to your Steam ID. It renews when you use the app and expires after 30 days of inactivity (and at most after 90 days). Signing out deletes it. It doesn't track you anywhere else.";
const RETENTION =
  "Steam sign-in tokens: up to 30 days after last use (90 days maximum), deleted on sign-out.";

describe("Steam session token privacy copy", () => {
  it("the draft carries Legal's text verbatim", () => {
    expect(draft).toContain(`> ${PRIVACY}\n`);
    expect(draft).toContain(`"${RETENTION}"`);
    expect(draft).toContain(
      "| Steam sign-in tokens | up to 30 days after last use (90 days maximum), deleted on sign-out. |",
    );
  });
  it("is not live while the feature is off (web privacy page unchanged)", () => {
    expect(live).not.toContain("sign-in token");
  });
});
