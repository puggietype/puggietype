import { readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { describe, it, expect } from "vitest";
import { ViteMinifyPlugin } from "vite-plugin-minify";

import { KEEP_COMMENTS } from "../../vite-plugins/email-off";
import {
  renderLegalMarkdown,
  slugify,
  wrapTables,
} from "../../vite-plugins/legal-markdown";

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

// Legal accounts review 2026-11-19, section 3c, as applied in 77ef668 (D1 settings sync, D2 Turnstile steps, download incl. email) (exact copy)
// plus the per-account rate-limit counters sentence (Account record) and retention row, pending Legal check
const ACCOUNTS_SECTION_LINES = [
  "## Accounts (ages 13+)",
  "You can use PuggieType without an account. Accounts are only for people aged 13 and over. If you create one, we process:",
  "- **Sign-in details:** if you use email and password, your email address and password (we never see your password; Google Firebase Authentication stores it only in hashed form). If you sign in with Google, Google gives Firebase Authentication your Google account ID, your email address, whether it's verified, and your Google profile name and picture link. We don't use or copy your name or picture, and we don't receive your Google password, contacts or other Google data. Firebase Authentication also records when your sign-in was created and last used, and Google may log technical data such as your IP address when you sign in.",
  "- **Account record:** a random account ID, a generated pug name, whether your email address is verified, that you passed the age check and when (never your birth year), whether your scores may be listed on leaderboards (off by default, and it can't be changed yet), when you created the account, and when the record was last updated (this changes when your signed-in session is set up with our service, for example when you sign in). The record also has fields we don't use yet, so they hold only their starting value for every account: seconds typed (0), a verified-typist mark and its date (off and empty), and an account status (active for everyone) with a reason and notice reference that stay empty unless the status is changed. Our database does not store your email address. To limit abuse, our database also keeps short-lived request counters for your account ID (how many requests of each kind, such as sign-in, saving or download, you made in the current hour or day; no content, no IP address or email). They are deleted with your account and otherwise within about 3 days.",
  "- **Settings sync:** while you're signed in, our website saves a fixed list of your PuggieType preference settings to your account and restores it when you sign in on another device. Free-text and link settings, such as a custom background link, stay on your device.",
  "- **Personal bests:** while you're signed in, after a finished standard test we save your best speed, raw speed, accuracy and consistency for that test mode, length, language and punctuation/numbers setting, with the date. These are sent from your browser, are not verified, are shown only to you, and are not used for leaderboards.",
  "- **Age check:** we ask for your birth year once, only to check that you're old enough. It isn't sent to our servers or stored; only a yes/no result is used. If the answer means you can't have an account, we delete the sign-in that was just made and keep only a note in your browser (with the time) that stops the question being asked again for 12 months. If that deletion fails, an automatic daily cleanup removes it within about 2 days.",
  "- **Security check:** the sign-in, create-account and age-check steps use Cloudflare Turnstile. When you open one, your browser loads Turnstile from Cloudflare, which looks at signals such as your IP address, browser and device details to tell people from bots, and keeps a small item in your browser. We use the result to protect sign-in and sign-up from abuse. Cloudflare does this for us as our processor; separately, Cloudflare also uses these signals as an independent controller to improve Turnstile, as described in the [Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/). Turnstile isn't used to show ads.",
  "- **Account emails:** Firebase sends you an email to verify your address and, if you ask, to reset your password or confirm an email change. These are only account emails, not marketing. We may also use your sign-in email to reply to your requests and to tell you about a decision on your account (see Decisions about your account below); we never use it for marketing.",
  "",
  "**Why (legal basis):** to provide the account you ask for, including sign-in, sync, personal bests, account emails, data download and deletion (performance of a contract, GDPR Art 6(1)(b)); to answer your rights requests and give you notices the law requires (legal obligation, Art 6(1)(c)); to keep sign-in and sign-up secure, apply request limits, stop abuse, enforce our Terms (including any decision on your account status) and keep accounts to people aged 13 and over (legitimate interests, Art 6(1)(f)). Where we rely on legitimate interests you can object (see Your rights).",
  "",
  "**Who processes it for us:** Google (Firebase Authentication, and Google sign-in if you use it), Cloudflare (Turnstile, and hosting of our accounts service and website) and Neon (our account database, hosted in the US, Oregon). They act as our processors under their data processing terms.",
  "",
  "**International transfers:** this data is stored and processed in the United States. For users in the EU, EEA, UK and Switzerland, transfers to Google LLC, Cloudflare, Inc. and Neon, LLC (through Databricks, Inc.'s certification) rely on their EU-U.S. Data Privacy Framework certifications and its UK Extension and the Swiss-U.S. equivalent. Where a certification doesn't cover a transfer (for example, to Neon, Inc., the importer named in Neon's data processing terms), it relies on the European Commission's Standard Contractual Clauses (and the UK and Swiss equivalents) in the provider's data processing terms.",
  "",
  "**What's in your browser:** while you're signed in, your browser keeps your sign-in in Google's Firebase storage (IndexedDB), a marker that you're signed in (\"ptAccountsSession\", localStorage), and, if saving settings hasn't finished, your account ID (\"ptAccountsSettingsDirty\", localStorage). After an under-13 answer it keeps \"ptAccountsAgeBlock\" (localStorage, 12 months). Cloudflare Turnstile keeps an item in its own frame in your browser's storage. We use these only to sign you in and protect sign-in, not for advertising, so we don't ask for consent for them.",
  "",
  "**How long we keep it:** for as long as you have an account. When you delete your account we delete your account record and everything saved to it, such as settings and personal bests, from our database and your sign-in from Firebase straight away; if Firebase can't be reached, we keep only your account ID until it is removed, within 30 days. Our database provider keeps short-term restore copies, and anything you delete drops out of them within about 6 hours; we don't restore deleted accounts. Google and Cloudflare keep limited security logs and backups as described in their own policies.",
  "",
  '**Deleting your account:** sign in, open the sign-in page and choose "delete account". You can also email privacy@puggietype.com and we\'ll do it within 30 days (we may ask you to confirm you control the account).',
  "",
  "**Decisions about your account:** if we ever suspend or end your account, or hide or remove a personal best, a person makes that decision, not an automated process alone. We'll tell you why and how to appeal (see our Terms). If you think we got it wrong, email privacy@puggietype.com.",
  "",
  "**Download your data:** when signed in, choose \"Download my data\" to get a JSON file with what our database holds for your account, plus your sign-in email address and sign-in method (email and password, or Google), which come from your sign-in and aren't stored in our database. The file has your account record (every field listed above, including your account ID, pug name, status, when you passed the age check and when the record was last updated), your settings and when they were last saved, and your personal bests. It also has two lists that are empty today because we don't record that data yet: recent results (each with the average and spread of your keystroke timing and the app version saved with it) and runs flagged for review (with the keystroke timings of those runs). Our short-lived abuse counters aren't included. We create the file when you ask and don't keep a copy. You can download it up to 3 times per UTC day; if you reach that limit, email privacy@puggietype.com and we'll send you a copy.",
  "",
  `**Your rights:** depending on where you live (including under the GDPR, UK GDPR and the California Consumer Privacy Act as amended), you can ask to access, correct, delete or export your data, to object to or restrict how we use it, and to complain to your data protection authority. Use the in-account download and delete, or email privacy@puggietype.com. To protect the service, in-account actions are limited per account (for example, up to 3 downloads per day), and a request over a limit is refused and you are asked to wait and try again. These limits never stop you using your rights: you can always email us instead. We'll answer within one month (45 days for California requests). We don't sell or share your personal information as those terms are defined in California law, and we won't treat you differently for using your rights. California residents: in the last 12 months we collected identifiers (account ID, email address), internet activity (settings, personal bests) and the age-check result, from you and from Google if you use Google sign-in, to run your account; we disclose it only to the processors listed above.`,
  "",
  "**Children:** accounts are only for people aged 13 and over, and the age check is a first line of defence, not a guarantee. If you're a parent or guardian and think a child under 13 has an account, email privacy@puggietype.com and we'll delete it.",
];
const ACCOUNTS_SECTION = ACCOUNTS_SECTION_LINES.join("\n");
const ACCOUNTS_NOT_IN_EFFECT =
  '<!-- NOT IN EFFECT UNTIL ACCOUNTS LAUNCH. Pre-launch text for the "Accounts (ages 13+)" section, from Legal\'s PR #28 review (2026-11-04, section (d)). Accounts are behind a flag that is off; this section describes no processing that happens today. -->';
const ACCOUNTS_RETENTION_ROWS = [
  "| Account data (account record including its status fields, settings, personal bests) in the Neon database | until you delete your account (then deleted; restore copies drop it within about 6 hours) |",
  "| Firebase sign-in (email address, password hash or Google ID, Google name and picture link) | until you delete your account; deleted with it, within 30 days at most if Firebase can't be reached |",
  "| Account ID kept after a failed Firebase deletion | until Firebase confirms the deletion, within 30 days |",
  "| Sign-in created before an under-13 answer | deleted straight away; if that fails, within about 2 days |",
  '| Browser: "ptAccountsSession", "ptAccountsSettingsDirty" (localStorage), Firebase sign-in (IndexedDB) | until you sign out, delete your account or clear site data |',
  '| Browser: age-check block "ptAccountsAgeBlock" (localStorage; time only, no birth year) | 12 months, or until you clear site data |',
  "| Cloudflare Turnstile item in your browser, and Turnstile signals | as described in Cloudflare's Turnstile Privacy Addendum |",
  "| Account data download (file on your device) | on your device until you delete it |",
  "| Abuse-limit request counters (account ID and counts) | until you delete your account, otherwise within about 3 days |",
].join("\n");
const ACCOUNTS_LEGAL_BASES = [
  "- To provide the account you ask for: sign-in, settings sync, personal bests, account emails, data download and deletion (Art. 6(1)(b), performance of a contract).",
  "- To keep sign-in and sign-up secure with Cloudflare Turnstile, to limit abusive request rates, to enforce our Terms on accounts, and to check that account holders are aged 13 and over (Art. 6(1)(f), legitimate interests).",
].join("\n");
const SOLO_ACCOUNTS =
  "this data never leaves your device unless you export it yourself or sign in to an account (see Accounts (ages 13+)).";
const COOKIES_ACCOUNTS =
  "We do not sell or share personal information for cross-context behavioral advertising. If you sign in, we also store the items listed under Accounts (ages 13+); they're used only to sign you in and aren't advertising or analytics.";
const CHILDREN_ACCOUNTS = [
  "If a parent or guardian tells us at privacy@puggietype.com that a child under 13 used multiplayer or created an account, we will delete any information we hold.",
  "and leaderboard scores are kept only as described under Leaderboards. Account data is deleted when the account is deleted.",
];

// Legal accounts review 2026-11-19, section 3c, service providers (D2 applied) (exact copy)
const NEON_PROVIDER =
  "- Neon, LLC (a Databricks company), USA: database hosting for account records (see Accounts (ages 13+)), settings, personal bests and leaderboard scores (AWS us-west-2, Oregon). Our database doesn't store your email address. Covered by Neon's Data Processing Addendum; transfers from the EU/UK/Switzerland rely on the Data Privacy Framework certification of Databricks, Inc., which covers Neon, LLC.";
const ACCOUNTS_PROVIDERS = [
  "- **Google LLC**, USA, sign-in with Google Firebase Authentication, including Google sign-in if you use it. Google acts as our processor under its data processing terms; transfers from the EU/UK/Switzerland rely on its Data Privacy Framework certification.",
  "- **Cloudflare, Inc.** also hosts our accounts service and runs Cloudflare Turnstile, the bot check on the sign-in, create-account and age-check steps. For the check itself Cloudflare acts as our processor; it also uses Turnstile signals as an independent controller to improve Turnstile (see the Accounts section).",
  NEON_PROVIDER,
].join("\n");
const PROVIDERS_NOT_IN_EFFECT =
  '<!-- NOT IN EFFECT UNTIL ACCOUNTS LAUNCH. The Google (Firebase Authentication) and Cloudflare Turnstile entries, and the account data in the Neon entry, are pre-launch text for the "Accounts (ages 13+)" section. Accounts are behind a flag that is off; these entries describe no processing that happens today. -->';
// Legal review 2026-11-19 (accounts-p1), section 4 items 1-4 (exact copy)
const TERMS_AGE =
  "PuggieType's solo typing test needs no account. You must be **at least 13 years old** to create an account or use multiplayer. If you are under 18, or under the age of majority where you live, use accounts and multiplayer only with the permission of a parent or guardian, who agrees to these Terms on your behalf.";
const TERMS_ACCOUNTS = [
  "You can create an account with your email address and a password, or with Google. Give accurate information, keep your sign-in details to yourself, and tell us at privacy@puggietype.com if you think someone else has used your account. You're responsible for what happens under your account. One account per person; don't create accounts to get around a suspension or limit.",
  "Settings and personal bests saved to your account come from your browser. We don't verify them, and they aren't leaderboard scores. Our service may automatically refuse to save a value that is outside realistic limits (that is not a decision to restrict your account), and we reserve the right to change or delete any saved personal best that we reasonably believe is wrong or was not achieved by typing by hand. We aren't required to review them.",
  'You can delete your account at any time from the sign-in page ("delete account"), or by emailing privacy@puggietype.com; see the Privacy Policy for what is deleted. We may suspend or end an account that breaks these Terms or is used to cheat, abuse others or attack the service, and we may change or stop account features. Account data download is provided as a convenience copy of the data described in the Privacy Policy and doesn\'t limit your legal rights.',
  "**If we restrict your account.** If we suspend or end your account, or hide or remove a personal best or other saved result because we believe you broke these Terms, a person at PuggieType makes that decision, not an automated process alone. We'll tell you what we did, why, and how to appeal, by email to the address you signed in with, unless the law or an urgent security reason stops us or we can't reach you; in an urgent case we may act first and tell you afterwards. To appeal, reply to that email or write to privacy@puggietype.com within 6 months. A person who wasn't involved in the first decision will look again where we can, and we'll answer within 30 days. If we find we got it wrong, we'll reverse the decision. Ending your account doesn't affect your right to ask for a copy of your data.",
];
const TERMS_ENFORCEMENT =
  "We may, at our discretion and without notice, remove any player from a room, close a room, rate-limit or block IP addresses or devices, limit who you are matched with (for example, matching players who repeatedly cheat only with Pug Bots), or suspend access to multiplayer for anyone who breaks these Terms. We suspend or end accounts only as described in section 5. To report a player, use the in-game report button or email privacy@puggietype.com.";
const TERMS_CHANGES =
  "We may update these Terms. We'll change the date at the top, and if a change is significant we'll say so on the site. Using PuggieType after a change means you accept it.";
const TERMS_HEADINGS = [
  "1. Age requirement",
  "2. Multiplayer",
  "3. Nicknames",
  "4. Leaderboards",
  "5. Accounts",
  "6. Acceptable use",
  "7. Enforcement",
  "8. Copyright complaints",
  "9. No warranty",
  "10. Open-source license",
  "11. Changes to these Terms",
  "12. Contact",
];
// unchanged from main (edb2095); bumped only at the accounts flag-on publish
const TERMS_DATE_LINE =
  '_Effective date: November 18, 2026. Last updated: November 18, 2026. "We", "us" and "our" mean the PuggieType team._';

const renderTerms = (): string =>
  renderLegalMarkdown(
    readFileSync(path.join(srcDir, "terms.html"), "utf-8"),
    legalDir,
  );
const inline = (md: string): string => {
  const html = marked.parseInline(md, { async: false });
  if (typeof html !== "string") throw new Error("marked returned a promise");
  return html;
};
const stripComments = (html: string): string =>
  html.replace(/<!--[\s\S]*?-->/g, "");

describe("legal-markdown", () => {
  for (const name of ["terms", "privacy"]) {
    it(`renders src/legal/${name}.md verbatim into ${name}.html`, () => {
      const page = readFileSync(path.join(srcDir, `${name}.html`), "utf-8");
      const md = readFileSync(path.join(legalDir, `${name}.md`), "utf-8");
      const html = renderLegalMarkdown(page, legalDir);

      const rendered = marked.parse(md, { async: false });
      if (typeof rendered !== "string") throw new Error("marked is async");
      // only the linked Accounts h2 gets an id
      const expected = rendered.replace(
        "<h2>Accounts (ages 13+)</h2>",
        '<h2 id="accounts-ages-13">Accounts (ages 13+)</h2>',
      );

      expect(html).not.toContain("legal-markdown:");
      // the only change to the rendered text is the table scroll wrapper
      expect(html).toContain(wrapTables(expected));
      const unwrapped = html
        .replace(/<div class="tableWrap"[^>]*>(<table>)/g, "$1")
        .replace(/(<\/table>)<\/div>/g, "$1");
      expect(unwrapped).toContain(expected);
    });
  }

  describe("table scroll wrappers", () => {
    const WRAP_OPEN =
      /<div class="tableWrap" tabindex="0" role="region" aria-label="([^"]+)"><table>/g;

    it("wraps every table in the privacy page in a focusable labelled region", () => {
      const page = readFileSync(path.join(srcDir, "privacy.html"), "utf-8");
      const html = renderLegalMarkdown(page, legalDir);
      const tables = html.match(/<table>/g) ?? [];
      const wraps = [...html.matchAll(WRAP_OPEN)];

      expect(tables.length).toBeGreaterThan(0);
      expect(wraps).toHaveLength(tables.length);
      expect(wraps[0]?.[1]).toBe("table: Retention summary");
      expect((html.match(/<\/table><\/div>/g) ?? []).length).toBe(
        tables.length,
      );
    });

    it("never leaves a bare table in either legal page", () => {
      for (const name of ["terms", "privacy"]) {
        const page = readFileSync(path.join(srcDir, `${name}.html`), "utf-8");
        const html = renderLegalMarkdown(page, legalDir);
        const bare = html.replace(WRAP_OPEN, "");
        expect(bare).not.toContain("<table>");
      }
    });

    it("labels each table after the heading above it, with a generic fallback", () => {
      const out = wrapTables(
        '<table><tr><td>0</td></tr></table>\n<h2 id="a">Data &amp; <em>use</em></h2>\n<table><tr><td>1</td></tr></table>\n<h3>Second</h3>\n<table><tr><td>2</td></tr></table>',
      );
      const labels = [...out.matchAll(WRAP_OPEN)].map((m) => m[1]);
      expect(labels).toEqual([
        "table: scrollable",
        "table: Data &amp; use",
        "table: Second",
      ]);
    });

    it("keeps the scroll wrapper and the narrow-screen main column in the stylesheet", () => {
      const scss = readFileSync(
        path.join(srcDir, "styles/static-page.scss"),
        "utf-8",
      );
      expect(scss).toMatch(/\.tableWrap \{\s*overflow-x: auto;/);
      expect(scss).toContain(".tableWrap:focus-visible");
      // main is a grid; its column must be allowed to shrink below the widest
      // child, or wide tables and long URLs push the text off a phone screen
      expect(scss).toMatch(
        /\nmain \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*overflow-wrap: anywhere;/,
      );
    });

    it("escapes quotes, angle brackets and ampersands in the aria-label", () => {
      const out = wrapTables(
        '<h2>Say "hi" <b>&lt;now&gt;</b> &amp; x <y</h2><table><tr><td>1</td></tr></table>',
      );
      const label = /aria-label="([^"]*)"/.exec(out)?.[1];
      expect(label).toBe("table: Say &quot;hi&quot; &lt;now&gt; &amp; x &lt;y");
      // the attribute cannot be broken out of, and no raw markup leaks in
      expect(out).toMatch(/^<h2>[^]*<\/h2><div class="tableWrap"/);
      expect(label).not.toMatch(/["<>]/);
      expect(out.match(/<div /g)).toHaveLength(1);
    });

    it("decodes then re-encodes entities once (no double escaping)", () => {
      const out = wrapTables(
        "<h2>A &amp; B &#39;c&#39; &#x26;</h2><table></table>",
      );
      expect(out).toContain("aria-label=\"table: A &amp; B 'c' &amp;\"");
    });

    it("does not throw on out-of-range numeric entities", () => {
      const out = wrapTables("<h2>A &#99999999; B</h2><table></table>");
      expect(out).toContain('aria-label="table: A &amp;#99999999; B"');
    });

    it("trims the heading text used for the label", () => {
      const out = wrapTables(
        "<h2>   Spaced out \n </h2><table><tr><td>1</td></tr></table>",
      );
      expect(out).toContain('aria-label="table: Spaced out"');
    });

    it("falls back to the generic label for a heading with no text", () => {
      const out = wrapTables(
        '<h2> <img src="x.png" alt=""> </h2><table></table>',
      );
      expect(out).toContain('aria-label="table: scrollable"');
    });

    it("suffixes repeated labels under one heading and restarts per heading", () => {
      const t = "<table><tr><td>x</td></tr></table>";
      const out = wrapTables(
        `<h2>Retention</h2>${t}<p>a</p>${t}${t}<h2>Other</h2>${t}${t}<h2>Retention</h2>${t}`,
      );
      expect(
        [...out.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]),
      ).toEqual([
        "table: Retention",
        "table: Retention (2)",
        "table: Retention (3)",
        "table: Other",
        "table: Other (2)",
        "table: Retention",
      ]);
    });

    it("keeps table cells from breaking words mid-word", () => {
      const scss = readFileSync(
        path.join(srcDir, "styles/static-page.scss"),
        "utf-8",
      );
      // main's overflow-wrap: anywhere would otherwise shrink table cells to
      // one character and split words (Workma|n) on the guide pages
      expect(scss).toMatch(
        /\ntable \{\s*border-collapse: collapse;[^}]*overflow-wrap: normal;/,
      );
    });

    it("leaves html without tables unchanged", () => {
      const html = "<h2>Hello</h2><p>no table</p>";
      expect(wrapTables(html)).toBe(html);
    });
  });

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
    for (const line of ACCOUNTS_SECTION_LINES.filter(Boolean)) {
      expect(md).toContain(`\n${line}\n`);
    }
    expect(md).toContain(
      `\n\n${ACCOUNTS_NOT_IN_EFFECT}\n${ACCOUNTS_SECTION}\n\n## Why we use this data`,
    );
    expect(md).toContain(
      `\n${STEAM_RETENTION_ROW_A}\n${ACCOUNTS_RETENTION_ROWS}\n| Player reports`,
    );
    expect(md).toContain(
      "_Effective date: November 18, 2026. Last updated: November 18, 2026._",
    );
  });

  it("adds the accounts edits to Solo typing, legal bases, Cookies and Children", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    const section = (h2: string): string => {
      const start = md.indexOf(`\n## ${h2}\n`);
      expect(start, h2).toBeGreaterThan(-1);
      return md.slice(start, md.indexOf("\n## ", start + 1));
    };

    expect(section("Solo typing tests")).toContain(SOLO_ACCOUNTS);
    expect(section("Why we use this data (GDPR legal bases)")).toContain(
      `\n${STEAM_LEGAL_BASIS}\n${ACCOUNTS_LEGAL_BASES}\n`,
    );
    expect(section("Cookies, analytics and error reporting")).toContain(
      `${COOKIES_ACCOUNTS}\n`,
    );
    for (const sentence of CHILDREN_ACCOUNTS) {
      expect(section("Children")).toContain(sentence);
    }
  });

  it("drops the old wrong accounts statements", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    const accounts = md.slice(
      md.indexOf("## Accounts (ages 13+)"),
      md.indexOf("## Why we use this data"),
    );

    expect(accounts).toContain("Neon (our account database");
    expect(accounts).not.toContain("Fly.io");
    expect(md).not.toContain(
      "the scores, personal bests and settings you save",
    );
    expect(md).not.toContain("keystroke timings for up to 7 days");
    expect(md).not.toContain(
      "transfers to Google LLC, Cloudflare, Inc., Fly.io, Inc. and Neon, LLC",
    );
    expect(md).not.toContain(
      "rely on their certifications under the EU-U.S. Data Privacy Framework",
    );
    expect(md).not.toContain("settings, scores and personal bests");
    expect(md).not.toContain("reset-password forms");
    expect(md).not.toContain(
      "| Account data | until you delete your account |",
    );
    expect(md).not.toContain(
      "| Firebase sign-in (email address, password hash or Google account ID) | deleted with the account (within 30 days at most) |",
    );
  });

  it("ships no bracketed placeholders (Legal G6/G7: [W], [VERIFY: ...])", () => {
    const placeholder = /\[W\]|\[VERIFY/;
    for (const file of ["privacy.md", "terms.md"]) {
      const md = readFileSync(path.join(legalDir, file), "utf-8");
      expect(md, file).not.toMatch(placeholder);
    }
    for (const file of ["privacy.html", "terms.html"]) {
      const page = readFileSync(path.join(srcDir, file), "utf-8");
      expect(page, file).not.toMatch(placeholder);
      // and the page as built, with the legal markdown rendered in
      expect(
        renderLegalMarkdown(page, legalDir),
        `${file} (built)`,
      ).not.toMatch(placeholder);
    }
  });

  it("states the verified Neon restore window (6 hours, both projects, 2026-11-19) in all three places", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");

    // leaderboard row (already live on main) and the two accounts places
    expect(md).toContain(
      "Deleted scores may persist in Neon restore copies for up to 6 hours |",
    );
    expect(md).toContain(
      "anything you delete drops out of them within about 6 hours; we don't restore deleted accounts.",
    );
    expect(md).toContain(
      "| until you delete your account (then deleted; restore copies drop it within about 6 hours) |",
    );
    expect(md.match(/6 hours/g)).toHaveLength(3);
    expect(md).not.toContain("restore copies overwritten within about 6 hours");
    expect(md).not.toContain("short-term restore copies are overwritten");
  });

  it("does not ship Tier B text (anti-cheat keystroke summary, verified typist) until a writer exists", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");

    expect(md).not.toContain("**Anti-cheat checks on your results:**");
    expect(md).not.toContain("**Verified typist:**");
    expect(md).not.toContain("keystroke timings and the reason");
    expect(md).not.toContain("Keystroke timings of a flagged run");
    expect(md).not.toContain("keystroke timings for up to 7 days");
    expect(md).not.toMatch(
      /Verified-typist mark and date|Solo results with their keystroke summary|verified-typist video link|Account status, reason and notice reference|seconds typed while signed in|keystroke timing summaries/,
    );
  });

  it("keeps the accounts not-in-effect note out of the visible page", () => {
    const page = readFileSync(path.join(srcDir, "privacy.html"), "utf-8");
    const html = renderLegalMarkdown(page, legalDir);
    const visible = html.replace(/<!--[\s\S]*?-->/g, "");

    expect(html).toContain(ACCOUNTS_NOT_IN_EFFECT);
    expect(visible).not.toMatch(/not in effect|pre-launch/i);
    expect(visible).toContain(
      '<h2 id="accounts-ages-13">Accounts (ages 13+)</h2>',
    );
  });

  it("lists the accounts service providers, marked not in effect", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    expect(md).toContain(
      `## Service providers\n${PROVIDERS_NOT_IN_EFFECT}\n- **Cloudflare, Inc.** hosts`,
    );
    expect(md).toContain(
      `our service provider, under a data processing agreement with us that includes the EU Standard Contractual Clauses.\n${ACCOUNTS_PROVIDERS}\n\nThese providers`,
    );
  });

  it("drops the superseded accounts transfer and email wording", () => {
    const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
    expect(md).not.toContain("transfers are covered as described in");
    expect(md).not.toContain("Neon's Data Privacy Framework certification");
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
    expect(visible).toContain(
      "<li><strong>Cloudflare, Inc.</strong> also hosts our accounts service",
    );
    expect(visible).toContain("<li>Neon, LLC (a Databricks company), USA:");
    expect(visible).toMatch(
      /<ul>\n<li><strong>Cloudflare, Inc.<\/strong> hosts[\s\S]*<li><strong>Fly\.io[\s\S]*<li><strong>Google LLC[\s\S]*<li><strong>Cloudflare, Inc.<\/strong> also[\s\S]*<li>Neon, LLC[^<]*<\/li>\n<\/ul>/,
    );
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
      "Like the rest of multiplayer, quick-chat is only for players aged 13 and over. To report misuse, use the report button or email privacy@puggietype.com.",
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

  it("replaces the old impossible-personal-best and enforcement wording (Legal 2026-11-19 Tier A)", () => {
    const md = readFileSync(path.join(legalDir, "terms.md"), "utf-8");

    expect(md).not.toContain(
      "and we may ignore, correct or remove any that look impossible or cheated.",
    );
    expect(md).not.toContain(
      "or suspend access to multiplayer or to your account for anyone who breaks these Terms.",
    );
    expect(md).toContain("We aren't required to review them.");
    expect(md).toContain("and doesn't limit your legal rights.");
    expect(md).toContain(
      "We suspend or end accounts only as described in section 5.",
    );
    expect(md.match(/\*\*If we restrict your account\.\*\*/g)).toHaveLength(1);
  });

  it("slugifies h2 text into ids", () => {
    expect(slugify("Accounts (ages 13+)")).toBe("accounts-ages-13");
    expect(slugify("Why we use this data (GDPR legal bases)")).toBe(
      "why-we-use-this-data-gdpr-legal-bases",
    );
  });

  it("gives the privacy Accounts h2 the id the app links to, and no other h2", () => {
    for (const name of ["terms", "privacy"]) {
      const page = readFileSync(path.join(srcDir, `${name}.html`), "utf-8");
      const html = renderLegalMarkdown(page, legalDir);
      const ids = [...html.matchAll(/<h2 id="([^"]+)">/g)].map((m) => m[1]);
      expect(ids, name).toEqual(name === "privacy" ? ["accounts-ages-13"] : []);
    }
  });

  describe("terms: Legal's accounts review section 4 (not in effect)", () => {
    it("has the age requirement (item 1) verbatim", () => {
      const html = renderTerms();
      expect(html).toContain(
        `<h2>1. Age requirement</h2>\n<p>${inline(TERMS_AGE)}</p>`,
      );
      expect(html).toContain(
        "<strong>at least 13 years old</strong> to create an account or use multiplayer",
      );
      expect(html).not.toContain("collects no account data");
    });

    it("has the 5. Accounts heading and its four paragraphs (item 2) verbatim", () => {
      const html = renderTerms();
      expect(html).toContain(
        `<h2>5. Accounts</h2>\n${TERMS_ACCOUNTS.map((p) => `<p>${inline(p)}</p>`).join("\n")}\n<h2>6. Acceptable use</h2>`,
      );
    });

    it("numbers the headings 1-12 in order, with 6-12 renumbered", () => {
      const html = renderTerms();
      const h2s = [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
      expect(h2s).toEqual(TERMS_HEADINGS.map((h) => inline(h)));
      for (const h of TERMS_HEADINGS.slice(5)) {
        expect(html).toContain(`<h2>${inline(h)}</h2>`);
      }
      for (const old of [
        "5. Acceptable use",
        "6. Enforcement",
        "7. Copyright complaints",
        "8. No warranty",
        "9. Open-source license",
        "10. Contact",
      ]) {
        expect(html).not.toContain(`<h2>${old}</h2>`);
      }
    });

    it("has the enforcement sentence covering accounts (item 3) verbatim", () => {
      const html = renderTerms();
      expect(html).toContain(
        `<h2>7. Enforcement</h2>\n<p>${inline(TERMS_ENFORCEMENT)}</p>`,
      );
    });

    it("has 11. Changes to these Terms (item 4) verbatim", () => {
      const html = renderTerms();
      expect(html).toContain(
        `<h2>11. Changes to these Terms</h2>\n<p>${inline(TERMS_CHANGES)}</p>\n<h2>12. Contact</h2>`,
      );
    });

    it("keeps the effective date line unchanged", () => {
      const html = renderTerms();
      expect(html).toContain(`<p>${inline(TERMS_DATE_LINE)}</p>`);
      expect(stripComments(html).match(/Effective date:/g)).toHaveLength(1);
    });

    it("hides the NOT IN EFFECT comments from the rendered page", async () => {
      const html = renderTerms();
      // one per item: age, accounts, enforcement, changes
      expect(
        html.match(/<!-- NOT IN EFFECT UNTIL ACCOUNTS LAUNCH\./g),
      ).toHaveLength(4);
      expect(stripComments(html)).not.toMatch(
        /not in effect|flag that is off/i,
      );
      // the build's html minifier drops them from the shipped page
      const plugin = ViteMinifyPlugin({ ignoreCustomComments: KEEP_COMMENTS });
      const hook = plugin.transformIndexHtml as {
        handler: (html: string) => Promise<string>;
      };
      const out = await hook.handler(html);
      expect(out).not.toMatch(/not in effect|flag that is off|#29/i);
      expect(out).toContain("<h2>5. Accounts</h2>");
      expect(out).toContain("<!--email_off-->");
    });
  });

  describe("contact line (Legal M7)", () => {
    const WHO_WE_ARE =
      "Who we are: PuggieType (puggietype.com) is responsible for the personal data described in this policy. For any privacy question or request, email privacy@puggietype.com.";

    it("has the exact Who-we-are line right after the title and date lines", () => {
      const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
      const lines = md.split("\n");
      expect(lines[0]).toBe("# Privacy Policy");
      expect(lines[2]).toMatch(/^_Effective date: .* Last updated: .*\._$/);
      expect(lines[4]).toBe(WHO_WE_ARE);
      expect(md.split(WHO_WE_ARE)).toHaveLength(2);
      expect(md).not.toContain("PuggieType is run by the PuggieType team");
      // the line is in the rendered page, too (as the first paragraph)
      const page = readFileSync(path.join(srcDir, "privacy.html"), "utf-8");
      const html = renderLegalMarkdown(page, legalDir);
      expect(html).toContain(
        "<p>Who we are: PuggieType (puggietype.com) is responsible for the personal data described in this policy. For any privacy question or request, email ",
      );
      expect(html).toContain('href="mailto:privacy@puggietype.com"');
    });

    it("uses only privacy@puggietype.com as an email address in the privacy policy and the terms", () => {
      for (const name of ["privacy", "terms"]) {
        const md = readFileSync(path.join(legalDir, `${name}.md`), "utf-8");
        const emails = md.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]+/g);
        expect(emails, name).not.toBeNull();
        expect(new Set(emails), name).toEqual(
          new Set(["privacy@puggietype.com"]),
        );
        expect(md, name).not.toMatch(/support@|jakemegan/i);
      }
    });

    it("names no people and gives no EU/UK representative", () => {
      const md = readFileSync(path.join(legalDir, "privacy.md"), "utf-8");
      expect(md).not.toMatch(/\bJake\b|\bMegan\b/);
      expect(md).not.toMatch(
        /(EU|UK|European|United Kingdom)\s+(data protection\s+)?representative/i,
      );
    });
  });
});
