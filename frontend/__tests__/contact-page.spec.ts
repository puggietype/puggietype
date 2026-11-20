import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const html = readFileSync(
  path.resolve(__dirname, "../src/contact.html"),
  "utf-8",
);
const text = html
  .replace(/<[^>]*>/g, "")
  .replace(/\s+/g, " ")
  .replace(/ ([.,])/g, "$1");

describe("contact page", () => {
  it("sends privacy and data requests to privacy@ and everything else to support@", () => {
    expect(html).toContain('href="mailto:support@puggietype.com"');
    expect(html).toContain('href="mailto:privacy@puggietype.com"');
    expect(text).toContain(
      "support@puggietype.com for bug reports, multiplayer problems, reports about a player, copyright notices, security reports and general feedback. For privacy and data requests, write to privacy@puggietype.com instead.",
    );
    expect(text).toContain(
      "or to make a request under data protection law, email privacy@puggietype.com.",
    );
  });

  it("no longer claims one address covers everything", () => {
    expect(html).not.toMatch(/one\s+address covers everything/i);
    expect(html).not.toContain("the same address");
    expect(html).not.toContain('"privacy" in the subject');
  });

  it("names privacy@ for privacy in the meta and JSON-LD descriptions, and keeps support@ as the organization email", () => {
    const descriptions = html.match(
      /How to contact PuggieType: [^"]*what to include\./g,
    );
    expect(descriptions).toHaveLength(4);
    for (const d of descriptions ?? []) {
      expect(d).toContain("support@puggietype.com for bugs");
      expect(d).toContain(
        "privacy@puggietype.com for privacy and data requests",
      );
      expect(d).not.toContain("privacy requests and feedback");
    }
    expect(html).toContain('"email": "support@puggietype.com"');
  });

  it("uses only these two puggietype.com addresses", () => {
    const emails = html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]+/g);
    expect(new Set(emails)).toEqual(
      new Set(["support@puggietype.com", "privacy@puggietype.com"]),
    );
  });
});
