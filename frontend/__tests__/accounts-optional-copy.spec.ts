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

  it("kids guide is unchanged and does not invite kids to sign up", () => {
    const kids = read("src/guide/typing-for-kids.html").replace(/\s+/g, " ");
    expect(kids).toContain("Solo tests need no account");
    expect(kids).not.toMatch(/sign[- ]?up|create an account|optional account/i);
  });

  it("sourcecode.txt uses the shared support address, not a personal one", () => {
    const text = read("static/challenges/sourcecode.txt");
    expect(text).not.toMatch(/jack@/i);
    expect(text.match(/support@puggietype\.com/g)).toHaveLength(16);
  });
});
