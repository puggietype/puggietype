import { readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { describe, it, expect } from "vitest";

import { renderLegalMarkdown } from "../../vite-plugins/legal-markdown";

const legalDir = path.resolve(__dirname, "../../src/legal");
const srcDir = path.resolve(__dirname, "../../src");
// Legal review 2026-11-04, Ruling 5, variant A (exact copy)
const VALVE_CONTROLLER =
  '**Valve Corporation (Steam)**, USA, is not our service provider. If you sign in with Steam, Valve processes your Steam account data as an independent controller under its own [Privacy Policy](https://store.steampowered.com/privacy_agreement/). We receive only your Steam ID, your ownership of PuggieType and its supporter pack, and your Steam display name, as described in "Steam sign-in (desktop app)".';
const STEAM_LEGAL_BASIS =
  "- To sign you in with Steam and unlock what you own on Steam, if you choose to (Art. 6(1)(b), performance of a contract).";
const STEAM_RETENTION_ROW_A =
  "| Steam ID, Steam ownership result and Steam display name (desktop app sign-in, on the game server) | in memory only while the sign-in request is handled; not written to disk, a database or logs |";
const STEAM_VARIANT_A =
  "The PuggieType desktop app on Steam can let you sign in with your Steam account. Sign-in happens on Steam's own website in your browser; we never see your Steam password. When you sign in, Steam tells our game server your public Steam ID, and our server asks Steam whether your account owns PuggieType (and any supporter pack) and what your Steam display name is. We use this only to sign you in, unlock what you own, and show your display name if it passes our name filter and you haven't hidden it. Our server does not store or log your Steam ID or display name; it holds them in memory only while handling the sign-in request. We don't sell or share Steam data, or use it for marketing. Our game server runs on Fly.io; see Service providers. Steam data is provided by Valve 'as is', without warranty. Valve's own handling of your data is described in Valve's Privacy Policy (https://store.steampowered.com/privacy_agreement/).";

// Legal review of PR #28 (accounts milestone A), 2026-11-04, section (d) (exact copy)
const ACCOUNTS_SECTION = [
  "## Accounts (ages 13+)",
  "You can use PuggieType without an account. If you create one, we process:",
  "- **Sign-in details:** your email address and password (stored only in hashed form by Google Firebase Authentication), or, if you sign in with Google, your Google account ID, email address and whether it's verified. We don't receive your Google password, contacts or other Google data.",
  "- **Account record:** a random account ID, a generated pug name, your email address, whether it's verified, when you created the account, and the scores and settings you save.",
  "- **Age check:** we ask for your birth year once, only to check that you're old enough. We don't send it to our servers or store it. Only a yes/no result is used. If the answer means you can't have an account, we delete the sign-in that was just made, and we keep only a note in your browser to stop the question being asked again.",
  "- **Security check:** sign-in and sign-up use Cloudflare Turnstile, which checks your browser and device signals (such as your IP address) to tell people from bots. Turnstile doesn't track you across sites for advertising.",
  "",
  "**Why (legal basis):** to provide the account you ask for (performance of a contract, GDPR Art 6(1)(b)), and to keep the service secure and stop abuse (legitimate interests, Art 6(1)(f)).",
  "",
  "**Who processes it for us:** Google (Firebase Authentication, and Google Sign-In if you use it), Cloudflare (Turnstile), Neon (our account database, hosted in the US, Oregon), and Fly.io (our server). They act as our processors under their data processing terms.",
  "",
  "**International transfers:** this data is stored and processed in the United States. For users in the EU, EEA, UK and Switzerland, transfers rely on the EU-U.S. Data Privacy Framework where the provider is certified, and otherwise on the European Commission's Standard Contractual Clauses.",
  "",
  "**How long we keep it:** for as long as you have an account. When you delete your account, we delete your account record and Firebase sign-in straight away. Database backups are overwritten within about 6 hours, and any leftover sign-in data is removed within 30 days. Cloudflare and Google keep limited security logs as described in their own privacy policies.",
  "",
  '**Deleting your account:** sign in, open the sign-in page, and choose "delete account". You can also email support@puggietype.com and we\'ll do it within 30 days.',
  "",
  "**Your rights:** depending on where you live (including under GDPR and the California Consumer Privacy Act), you can ask to access, correct, delete or export your data, or object to how we use it, by emailing support@puggietype.com. You can also complain to your local data protection authority. We don't sell or share your personal information, as those terms are defined in California law.",
  "",
  "**Children:** accounts are only for people aged 13 and over. If you're a parent or guardian and think a child under 13 has an account, email support@puggietype.com and we'll delete it.",
].join("\n");
const ACCOUNTS_NOT_IN_EFFECT =
  '<!-- NOT IN EFFECT UNTIL ACCOUNTS LAUNCH. Pre-launch text for the "Accounts (ages 13+)" section, from Legal\'s PR #28 review (2026-11-04, section (d)). Accounts are behind a flag that is off; this section describes no processing that happens today. -->';
const ACCOUNTS_RETENTION_ROWS = [
  "| Account data | until you delete your account |",
  "| Firebase sign-in | deleted with the account (within 30 days at most) |",
].join("\n");

describe("legal-markdown", () => {
  for (const name of ["terms", "privacy"]) {
    it(`renders src/legal/${name}.md verbatim into ${name}.html`, () => {
      const page = readFileSync(path.join(srcDir, `${name}.html`), "utf-8");
      const md = readFileSync(path.join(legalDir, `${name}.md`), "utf-8");
      const html = renderLegalMarkdown(page, legalDir);

      expect(html).not.toContain("legal-markdown:");
      expect(html).toContain(marked.parse(md, { async: false }));
    });
  }

  it("privacy page descriptions do not say leaderboards are memory-only", () => {
    const page = readFileSync(path.join(srcDir, "privacy.html"), "utf-8");
    expect(page).not.toMatch(/memory only|in memory/i);
    expect(page).toContain("Neon database in Oregon");
  });

  it("includes the leaderboards privacy section verbatim", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    expect(md).toContain(
      "The 'Show my score on the leaderboard' setting defaults on, but a score is posted only when you press a Submit score button (Submit score to leaderboard, or Submit score & next test, & repeat or & retry saving). We then save your randomly assigned nickname and your speed (wpm), accuracy and raw speed. Solo scores are lightly checked by our server for impossible speeds, but they aren't verified like multiplayer scores, so they appear on a separate 'Solo' board. We save these scores in our database, which is hosted for us by Neon on Amazon Web Services servers in Oregon, USA.",
    );
    expect(md).toContain(
      "We may remove scores that look cheated or that break our rules.",
    );
    expect(md).not.toContain("We may remove any score that looks cheated.");
    expect(md).toContain(
      "email us your nickname, board, and the approximate date and score, and we'll find and remove it.",
    );
    expect(md).toContain(
      "Neon, LLC (a Databricks company), USA, database hosting for leaderboard scores (AWS us-west-2, Oregon). Covered by Neon's Data Processing Addendum; transfers from the EU/UK rely on Neon's Data Privacy Framework certification.",
    );
    expect(md).not.toContain("account data once accounts launch");
    expect(md).not.toContain("your rank");
  });

  it("includes Legal's Steam sign-in section (variant A) verbatim", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    expect(md).toContain(
      `## Steam sign-in (desktop app)\n${STEAM_VARIANT_A}\n`,
    );
    // Legal addendum 2026-11-04 (2): exact texts
    expect(md).toContain(`\n\n${VALVE_CONTROLLER}\n\n## Cookies`);
    expect(md).toContain(
      `- To comply with legal obligations (Art. 6(1)(c)).\n${STEAM_LEGAL_BASIS}\n`,
    );
    expect(md).toContain(`\n${STEAM_RETENTION_ROW_A}\n`);
    expect(md).not.toContain("Hosting providers");
    // variant B (session token) is not live yet
    expect(md).not.toContain("random session token");
  });

  it("includes Legal's accounts section verbatim, marked not in effect", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    expect(md).toContain(
      `\n\n${ACCOUNTS_NOT_IN_EFFECT}\n${ACCOUNTS_SECTION}\n\n## Why we use this data`,
    );
    expect(md).toContain(
      `\n${STEAM_RETENTION_ROW_A}\n${ACCOUNTS_RETENTION_ROWS}\n`,
    );
    expect(md).toContain(
      "_Effective date: November 4, 2026. Last updated: November 4, 2026._",
    );
  });

  it("keeps the accounts not-in-effect note out of the visible page", () => {
    const page = readFileSync(path.join(srcDir, "privacy.html"), "utf-8");
    const html = renderLegalMarkdown(page, legalDir);
    const visible = html.replace(/<!--[\s\S]*?-->/g, "");

    expect(html).toContain(ACCOUNTS_NOT_IN_EFFECT);
    expect(visible).not.toMatch(/not in effect|pre-launch/i);
    expect(visible).toContain("<h2>Accounts (ages 13+)</h2>");
  });

  it("contains no chat clauses", () => {
    for (const name of ["terms", "privacy"]) {
      const md = readFileSync(path.join(legalDir, `${name}.md`), "utf-8");
      expect(md).not.toMatch(/quick-chat messages|free-text nickname/i);
      expect(md).toContain("There is no chat");
    }
  });
});
