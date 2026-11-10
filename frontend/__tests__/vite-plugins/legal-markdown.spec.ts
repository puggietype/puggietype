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
      "After a completed solo test, a score is posted only when you press Submit score. Finishing a test, starting the next one, or leaving the results page doesn't post it. You can turn 'Show my score on the leaderboard' off before you press Submit score. We then save your randomly assigned nickname, your speed (wpm), accuracy and raw speed, and that test's settings (mode, length, language, punctuation and numbers). Solo scores are lightly checked by our server for impossible speeds, but they aren't otherwise verified. We save these scores in our database, which is hosted for us by Neon on Amazon Web Services servers in Oregon, USA.",
    );
    expect(md).toContain(
      "We may remove scores that look cheated or that break our rules.",
    );
    expect(md).not.toContain("We may remove any score that looks cheated.");
    expect(md).toContain(
      "email us your nickname, board, and the approximate date and score, and we'll find and remove it.",
    );
    expect(md).toContain(
      "Multiplayer race results are no longer submitted to Ranks from the site.",
    );
    expect(md).toContain(
      "Multiplayer scores submitted earlier may stay in our database, and remain available from our game server",
    );
    expect(md).toContain(
      "Leaderboard score (random nickname, wpm, accuracy, raw speed, test settings), including earlier multiplayer scores",
    );
    expect(md).not.toContain("server rejects");
    expect(md).not.toContain("no longer accepted");
    expect(md).not.toContain("separate 'Solo' board");
    expect(md).toContain("Last updated: November 4, 2026.");
    const faq = readFileSync(path.join(srcDir, "faq.html"), "utf8");
    const faqAnswer =
      "Your settings stay in your browser. Ranks shows solo test scores that players chose to submit: after a completed solo test, a score is posted only when you press Submit score. A posted score shows your random nickname, wpm, accuracy and raw speed, with that test's settings. Solo scores are lightly checked by our server for impossible speeds, and we may remove any score that looks cheated. The current website no longer submits multiplayer race results to Ranks. Daily, weekly and monthly boards reset on UTC time and clear when the period ends; all-time scores, including earlier multiplayer scores, are kept for up to 12 months. PuggieType also keeps the speeds of your last 10 valid 30-second English tests in your browser, to estimate your pace for Quick Match.";
    expect(faq.split(faqAnswer).length - 1).toBe(2);
    expect(faq).toContain('datetime="2026-11-04"');
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

  it("includes Legal's GA4 paragraph and retention row verbatim", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    expect(md).toContain(
      "**Google Analytics 4.** We use Google Analytics 4 (Google LLC) to understand how people use puggietype.com (for example page views and rough geography). Google may process technical data such as IP address, device/browser type, and page URLs on our behalf. We configure GA4 with Google signals off and without using Analytics for ads personalization. We ask before GA4 runs, wherever you are. If you reject or don't choose, it doesn't load. See [Google's privacy policy](https://policies.google.com/privacy) and [how Google uses data when you use our partners' sites](https://policies.google.com/technologies/partner-sites). You can also use [Google Analytics opt-out](https://tools.google.com/dlpage/gaoptout) where available.",
    );
    expect(md).toContain(
      "| Google Analytics 4 event data | per our GA4 property retention setting (we use the shortest available that still supports a 30-day traffic review, then auto-expire); deleted from our property when retention elapses or if we remove GA4 |",
    );
    expect(md).toContain(
      'Your analytics choice is saved in this browser (localStorage "acceptedCookies") until you change it or clear site data.',
    );
    expect(md).toContain(
      'After a visit to a kids guide, a session-only marker ("puggie-kids-flow") keeps the analytics banner and Google Analytics off in that tab.',
    );
    expect(md).toContain("does not delete other stored data");
    expect(md).not.toContain("pt_country");
    expect(md).not.toContain("Where the law requires consent");
    expect(md).not.toContain("doesn't load any analytics");
    expect(md).not.toContain("no analytics scripts");
  });

  it("contains no chat clauses", () => {
    for (const name of ["terms", "privacy"]) {
      const md = readFileSync(path.join(legalDir, `${name}.md`), "utf-8");
      expect(md).not.toMatch(/quick-chat messages|free-text nickname/i);
      expect(md).toContain("There is no chat");
    }
  });
});
