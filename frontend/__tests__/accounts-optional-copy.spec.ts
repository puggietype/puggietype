import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (rel: string): string =>
  readFileSync(path.join(root, rel), "utf8");

// Accounts are optional (ages 13+). Public pages must not claim that the
// site has no accounts, sign-ups, logins or profiles at all.

const FAQ_ANSWER =
  "No. You can play without an account: solo tests work as soon as the page loads, and multiplayer gives you a random nickname for the session. Optional accounts (ages 13+) can sync your settings and personal bests. There are no public profiles.";

const PAGES = [
  "src/faq.html",
  "src/guide/about.html",
  "src/html/site-intro.html",
  "src/guide/modes-settings.html",
];

describe("optional accounts copy (Legal G7 condition 3)", () => {
  it("faq: visible answer and FAQPage JSON-LD say the same thing", () => {
    const faq = read("src/faq.html");
    expect(faq).toContain(`<p>${FAQ_ANSWER}</p>`);
    expect(faq).toContain(`"text": "${FAQ_ANSWER}"`);
    const blocks = [
      ...faq.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ].map((m) => JSON.parse(m[1] as string) as Record<string, unknown>);
    const page = blocks.find((b) => b["@type"] === "FAQPage") as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    const q = page.mainEntity.find((e) => e.name === "Do I need an account?");
    expect(q?.acceptedAnswer.text).toBe(FAQ_ANSWER);
  });

  it.each(PAGES)("%s makes no false 'no accounts' claim", (page) => {
    const html = read(page).replace(/\s+/g, " ");
    expect(html).not.toMatch(/no sign-ups?, logins? or profiles/i);
    expect(html).not.toMatch(/no sign-up, no account/i);
    expect(html).not.toMatch(/no account to (create|sync)/i);
    expect(html).not.toMatch(/is no account to/i);
  });

  it("about, site-intro and modes-settings use the reworded sentences", () => {
    const about = read("src/guide/about.html").replace(/\s+/g, " ");
    expect(about).toContain(
      "You don't need an account, and the website's code is open source.",
    );
    expect(about).toContain(
      "You don't need an account, and there is no waiting screen between you",
    );
    expect(read("src/html/site-intro.html").replace(/\s+/g, " ")).toContain(
      "No account is needed, and without one solo results stay in your browser",
    );
    const modes = read("src/guide/modes-settings.html").replace(/\s+/g, " ");
    expect(modes).toContain("Without an account, clearing your browser data");
    expect(modes).toContain(
      "use an optional account (ages 13 and over) to sync them between devices",
    );
  });

  it("kids guide qualifies the browser claim and does not invite kids to sign up", () => {
    const kids = read("src/guide/typing-for-kids.html").replace(/\s+/g, " ");
    expect(kids).toContain(
      "Solo tests need no account, and without one the results stay in the browser.",
    );
    expect(kids).not.toMatch(/sign[- ]?up|create an account|optional account/i);
  });

  it("faq analytics answer: JSON-LD and visible text both mention the optional account", () => {
    const faq = read("src/faq.html");
    const clause =
      "Solo test data stays in your browser, except a leaderboard score you choose to submit, the average speed plus a random Quick Match ID sent when you join Quick Match, and, if you use an optional account (ages 13+), your settings and personal bests.";
    expect(faq.split(clause).length - 1).toBe(2);
  });

  it("changed pages carry their last-updated date in JSON-LD, visible date and sitemap", () => {
    const sitemap = read("static/sitemap.xml");
    for (const [page, loc, iso, human] of [
      ["src/faq.html", "/faq", "2026-11-23", "November 23, 2026"],
      [
        "src/guide/about.html",
        "/guide/about",
        "2026-11-23",
        "November 23, 2026",
      ],
      [
        "src/guide/modes-settings.html",
        "/guide/modes-settings",
        "2026-11-20",
        "November 20, 2026",
      ],
    ] as const) {
      const html = read(page);
      expect(html).toContain(`"dateModified": "${iso}"`);
      expect(html).toContain(`<time datetime="${iso}">${human}</time>`);
      expect(sitemap).toContain(
        `<loc>https://puggietype.com${loc}</loc>\n  <lastmod>${iso}</lastmod>`,
      );
    }
  });

  it("homepage title and descriptions say 'no account needed'", () => {
    const index = read("src/index.html");
    expect(index).toContain(
      "<title>Free minimalist typing test, no account needed | PuggieType</title>",
    );
    expect(index).not.toMatch(/no account(?! needed)/);
    expect(read("src/ts/utils/misc.ts")).toContain(
      "Free minimalist typing test, no account needed | PuggieType",
    );
  });

  it("sourcecode.txt uses the shared support address, not a personal one", () => {
    const text = read("static/challenges/sourcecode.txt");
    expect(text).not.toMatch(/jack@/i);
    expect(text.match(/support@puggietype\.com/g)).toHaveLength(16);
  });
});
