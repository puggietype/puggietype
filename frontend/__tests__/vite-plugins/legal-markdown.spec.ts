import { readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { describe, it, expect } from "vitest";

import {
  renderLegalMarkdown,
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

describe("legal-markdown", () => {
  for (const name of ["terms", "privacy"]) {
    it(`renders src/legal/${name}.md verbatim into ${name}.html`, () => {
      const page = readFileSync(path.join(srcDir, `${name}.html`), "utf-8");
      const md = readFileSync(path.join(legalDir, `${name}.md`), "utf-8");
      const html = renderLegalMarkdown(page, legalDir);

      expect(html).not.toContain("legal-markdown:");
      const rendered = marked.parse(md, { async: false }) as string;
      // the only change to the rendered text is the table scroll wrapper
      expect(html).toContain(wrapTables(rendered));
      const unwrapped = html
        .replace(/<div class="tableWrap"[^>]*>(<table>)/g, "$1")
        .replace(/(<\/table>)<\/div>/g, "$1");
      expect(unwrapped).toContain(rendered);
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
      "Your settings stay in your browser, unless you use an optional account (ages 13+): then your settings and personal bests are also saved to your account, and only you can see them. Ranks shows solo test scores that players chose to submit: after a completed solo test, the score is sent only when you press Submit score. A score the server adds shows your random nickname, wpm, accuracy and raw speed, with that test's settings. Solo scores are lightly checked by our server for impossible speeds, and we may remove any score that looks cheated. The current website no longer submits multiplayer race results to Ranks. Daily, weekly and monthly boards reset on UTC time and clear when the period ends. Scores from an ended period stop showing right away, and the stored rows are deleted automatically, usually within an hour. All-time scores, including earlier multiplayer scores, are kept for up to 12 months. PuggieType also keeps the speeds of your last 10 valid 30-second English tests in your browser, to estimate your pace for Quick Match.";
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
