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

// Legal review of PR #28 (accounts milestone A), 2026-11-04, section (d), with the flag-on review of PR #29 (2026-11-04, section 2) applied (exact copy)
const ACCOUNTS_SECTION = [
  "## Accounts (ages 13+)",
  "You can use PuggieType without an account. If you create one, we process:",
  "- **Sign-in details:** your email address and password (stored only in hashed form by Google Firebase Authentication), or, if you sign in with Google, your Google account ID, email address and whether it's verified. We don't receive your Google password, contacts or other Google data.",
  "- **Account record:** a random account ID, a generated pug name, whether your email address is verified, that you passed the age check and when (never your birth year), whether your scores are listed on leaderboards, the scores, personal bests and settings you save, and when you created the account. Your email address itself is stored only by Google Firebase Authentication, not in our database. If a result looks suspicious, we keep its keystroke timings for up to 7 days for anti-cheat review.",
  "- **Age check:** we ask for your birth year once, only to check that you're old enough. We don't send it to our servers or store it. Only a yes/no result is used. If the answer means you can't have an account, we delete the sign-in that was just made, and we keep only a note in your browser to stop the question being asked again.",
  "- **Security check:** sign-in and sign-up use Cloudflare Turnstile, which checks your browser and device signals (such as your IP address) to tell people from bots. Turnstile doesn't track you across sites for advertising.",
  "",
  "**Why (legal basis):** to provide the account you ask for (performance of a contract, GDPR Art 6(1)(b)), and to keep the service secure and stop abuse (legitimate interests, Art 6(1)(f)).",
  "",
  "**Who processes it for us:** Google (Firebase Authentication, and Google Sign-In if you use it), Cloudflare (Turnstile), Neon (our account database, hosted in the US, Oregon), and Fly.io (our server). They act as our processors under their data processing terms.",
  "",
  "**International transfers:** this data is stored and processed in the United States. For users in the EU, EEA, UK and Switzerland, transfers to Google LLC, Cloudflare, Inc., Fly.io, Inc. and Neon, LLC (through Databricks, Inc.'s certification) rely on their certifications under the EU-U.S. Data Privacy Framework, its UK Extension and the Swiss-U.S. Data Privacy Framework. Where a certification doesn't apply, transfers rely on the European Commission's Standard Contractual Clauses (and the UK and Swiss equivalents) in their data processing terms.",
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
  "| Firebase sign-in (email address, password hash or Google account ID) | deleted with the account (within 30 days at most) |",
].join("\n");

// Legal flag-on review of PR #29, 2026-11-04, section 2 (exact copy)
const NEON_PROVIDER =
  "- Neon, LLC (a Databricks company), USA, database hosting for account records (account ID, generated pug name, email-verified status, age-check result, settings, scores and personal bests) and leaderboard scores (AWS us-west-2, Oregon). Our database doesn't store your email address. Covered by Neon's Data Processing Addendum; transfers from the EU/UK/Switzerland rely on the Data Privacy Framework certification of Databricks, Inc., which covers Neon, LLC.";
const ACCOUNTS_PROVIDERS = [
  "- **Google LLC**, USA, account sign-in with Google Firebase Authentication, including Google sign-in if you use it. Google acts as our processor under its data processing terms; transfers from the EU/UK/Switzerland rely on its Data Privacy Framework certification.",
  "- **Cloudflare, Inc.** also runs Cloudflare Turnstile, the security check on sign-in and sign-up, which checks browser and device signals (such as your IP address) to tell people from bots. Cloudflare acts as our processor under its data processing terms; transfers from the EU/UK/Switzerland rely on its Data Privacy Framework certification.",
].join("\n");
const PROVIDERS_NOT_IN_EFFECT =
  '<!-- NOT IN EFFECT UNTIL ACCOUNTS LAUNCH. The Google (Firebase Authentication) and Cloudflare Turnstile entries, and the account data in the Neon entry, are pre-launch text for the "Accounts (ages 13+)" section. Accounts are behind a flag that is off; these entries describe no processing that happens today. -->';

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
      "After a completed solo test, the score is sent only when you press Submit score. Finishing a test, starting the next one, or leaving the results page doesn't send it. You can turn 'Show my score on the leaderboard' off before you press Submit score. If it's off, the score isn't added to Ranks. If the server adds the score, we then save your randomly assigned nickname, your speed (wpm), accuracy and raw speed, and that test's settings (mode, length, language, punctuation and numbers). Solo scores are lightly checked by our server for impossible speeds, but they aren't otherwise verified. We save these scores in our database, which is hosted for us by Neon on Amazon Web Services servers in Oregon, USA.",
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
    expect(md).toContain("Last updated: November 18, 2026.");
    const faq = readFileSync(path.join(srcDir, "faq.html"), "utf8");
    const faqAnswer =
      "Your settings stay in your browser. Ranks shows solo test scores that players chose to submit: after a completed solo test, the score is sent only when you press Submit score. A score the server adds shows your random nickname, wpm, accuracy and raw speed, with that test's settings. Solo scores are lightly checked by our server for impossible speeds, and we may remove any score that looks cheated. The current website no longer submits multiplayer race results to Ranks. Daily, weekly and monthly boards reset on UTC time and clear when the period ends. Scores from an ended period stop showing right away, and the stored rows are deleted automatically, usually within an hour. All-time scores, including earlier multiplayer scores, are kept for up to 12 months. PuggieType also keeps the speeds of your last 10 valid 30-second English tests in your browser, to estimate your pace for Quick Match.";
    expect(faq.split(faqAnswer).length - 1).toBe(2);
    for (const page of [
      "faq.html",
      "guide/about.html",
      "guide/multiplayer.html",
    ]) {
      const html = readFileSync(path.join(srcDir, page), "utf8");
      // stamped on or after the 2026-11-10 legal update
      const modified =
        /"dateModified": "(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1] ?? "";
      expect(modified >= "2026-11-10", modified).toBe(true);
      // the visible date must say the same day as the machine date
      const human = new Date(`${modified}T12:00:00Z`).toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" },
      );
      expect(html).toContain(`<time datetime="${modified}">${human}</time>`);
      expect(html).not.toContain("November 4, 2026");
    }
    expect(md).toContain(`\n${NEON_PROVIDER}\n`);
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
      "_Effective date: November 18, 2026. Last updated: November 18, 2026._",
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

  it("lists the accounts service providers, marked not in effect", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    expect(md).toContain(
      `## Service providers\n${PROVIDERS_NOT_IN_EFFECT}\n- **Cloudflare, Inc.** hosts`,
    );
    expect(md).toContain(`\n${NEON_PROVIDER}\n${ACCOUNTS_PROVIDERS}\n\n`);
  });

  it("drops the superseded accounts transfer and email wording", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    expect(md).not.toContain("transfers are covered as described in");
    expect(md).not.toContain("Neon's Data Privacy Framework certification");
    expect(md).not.toContain("your email address, whether it's verified");
    expect(md).not.toContain("| Firebase sign-in |");
  });

  it("renders the service providers as one list, note hidden", () => {
    const page = readFileSync(path.join(srcDir, "privacy.html"), "utf-8");
    const html = renderLegalMarkdown(page, legalDir);
    const section = html.slice(
      html.indexOf("<h2>Service providers</h2>"),
      html.indexOf("<h2>Cookies"),
    );
    const visible = section.replace(/<!--[\s\S]*?-->/g, "");

    expect(section).toContain(PROVIDERS_NOT_IN_EFFECT);
    expect(visible).not.toMatch(/not in effect|pre-launch/i);
    expect(visible.match(/<ul>/g)).toHaveLength(1);
    expect(visible.match(/<li>/g)).toHaveLength(5);
    expect(visible).toContain("<li><strong>Google LLC</strong>, USA");
    expect(visible).toContain("Cloudflare Turnstile");
  });

  it("includes Legal's GA4 paragraph and retention row verbatim", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    expect(md).toContain(
      "**Google Analytics 4.** We use Google Analytics 4 (Google LLC) to understand how people use puggietype.com (for example page views and rough geography). Google may process technical data such as IP address, device/browser type, and page URLs on our behalf. We configure GA4 with Google signals off and without using Analytics for ads personalization. We ask before GA4 runs, wherever you are. If you reject or don't choose, it doesn't load. Google Analytics 4 sets first-party cookies `_ga` and `_ga_<ID>` only after you accept; they are used to tell browsers and visits apart; they last up to 13 months after your last visit with analytics on. To withdraw, open Privacy and cookie settings and turn analytics off. GA stops right away in that tab, and in other open PuggieType tabs when they reload. PuggieType deletes its GA cookies, and you can also clear cookies in your browser. See [Google's privacy policy](https://policies.google.com/privacy) and [how Google uses data when you use our partners' sites](https://policies.google.com/technologies/partner-sites). You can also use [Google Analytics opt-out](https://tools.google.com/dlpage/gaoptout) where available.",
    );
    expect(md).toContain(
      "| Google Analytics 4 event data | per our GA4 property retention setting (we use the shortest available that still supports a 30-day traffic review, then auto-expire); deleted from our property when retention elapses or if we remove GA4 |",
    );
    expect(md).toContain(
      "| Google Analytics 4 cookies (`_ga`, `_ga_<ID>`) | Set only after you accept; tell browsers and visits apart; up to 13 months after your last visit with analytics on. Withdraw in Privacy and cookie settings (analytics off); we delete them, or clear cookies in your browser. |",
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

  it("has Legal's quick-chat clauses (C1-C5, L3) and no stale no-chat claims", () => {
    const terms = readFileSync(path.join(legalDir, "terms.md"), "utf-8");
    const privacy = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    for (const md of [terms, privacy]) {
      expect(md).not.toContain("There is no chat");
      expect(md).not.toMatch(/free-text nickname/i);
    }
    // C1 + C2
    expect(terms).toContain(
      "In private rooms (in the lobby and on the results screen) you can send quick-chat:",
    );
    expect(terms).not.toContain("In private lobbies you can send quick-chat");
    expect(terms).toContain(
      "Like the rest of multiplayer, quick-chat is only for players aged 13 and over. To report misuse, use the report button or email support@puggietype.com.",
    );
    // C3 + C4
    expect(privacy).toContain(
      "with the random player ID for your current session (which your lobby already uses to show who's who)",
    );
    expect(privacy).not.toContain("already see)");
    expect(privacy).toContain(
      "We keep three anonymous daily totals: how many quick-chat lines and emotes were sent, and how many were blocked by our rate limits. These totals don't say who sent anything, in which lobby, or which preset was used.",
    );
    expect(privacy).not.toContain("anonymous daily count");
    // C5
    expect(privacy).toContain(
      '| Quick-chat mutes (sessionStorage "puggie-qc-muted") |',
    );
    expect(privacy).toContain(
      '| "Hide quick-chat" choice (localStorage "puggie-qc-hidden") |',
    );
    expect(privacy).toContain("the three anonymous daily quick-chat totals");
    // Legal's purge sentence, on /privacy and /faq
    const purge =
      "Scores from an ended period stop showing right away, and the stored rows are deleted automatically, usually within an hour.";
    expect(privacy).toContain(purge);
    expect(readFileSync(path.join(srcDir, "faq.html"), "utf8")).toContain(
      purge,
    );
  });

  it("has no stale no-chat claims on the guide pages and shows the Font Awesome credit (C6, L6)", () => {
    const read = (page: string): string =>
      readFileSync(path.join(srcDir, page), "utf8");
    const terms = readFileSync(path.join(legalDir, "terms.md"), "utf-8");
    const privacy = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    for (const page of [
      "faq.html",
      "guide/about.html",
      "guide/multiplayer.html",
      "guide/typing-for-kids.html",
    ]) {
      expect(read(page), page).not.toMatch(
        /no chat|moderation or chat|accounts or chat/,
      );
    }
    expect(read("guide/typing-for-kids.html")).toContain(
      "accounts or typed chat (only fixed, friendly preset messages)",
    );
    const about = read("guide/about.html").replace(/\s+/g, " ");
    expect(about).toContain(
      'Icons: Font Awesome Free by Fonticons, Inc. (<a href="https://fontawesome.com/" rel="noopener">fontawesome.com</a>). Its icons are licensed under <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a>, its fonts under <a href="https://openfontlicense.org/" rel="noopener">SIL OFL 1.1</a> and its code under <span style="white-space: nowrap"><a href="https://opensource.org/license/mit" rel="noopener">MIT</a>.</span>',
    );
    expect(read("guide/multiplayer.html")).toContain(
      "There is no typed chat, and you can't type your own messages to other players. In private rooms, you can send quick-chat: fixed, friendly preset lines and emotes that anyone can mute or hide.",
    );
    expect(terms).toContain(
      "Quick-chat isn't available in Quick Match or Open Rooms.",
    );
    expect(privacy).toContain(
      'Your mutes are kept only in that browser tab and are dropped when the tab session ends, and your "hide quick-chat" choice stays in your browser until you turn it off or clear site data.',
    );
  });
});
