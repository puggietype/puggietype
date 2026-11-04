import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const html = readFileSync(
  path.resolve(__dirname, "../src/creators.html"),
  "utf-8",
);
const footer = readFileSync(
  path.resolve(__dirname, "../src/html/static-page/footer.html"),
  "utf-8",
);
const text = html.replace(/\s+/g, " ");

describe("creators page", () => {
  it("has the approved title, canonical url and one h1", () => {
    expect(html).toContain("<title>Creators welcome | PuggieType</title>");
    expect(html).toContain(
      '<link rel="canonical" href="https://puggietype.com/creators" />',
    );
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toContain('<html lang="en">');
  });

  it("uses support@puggietype.com as the contact", () => {
    expect(html).toContain('href="mailto:support@puggietype.com"');
  });

  it("has no ads, ad scripts or support prompts", () => {
    expect(html).not.toMatch(/adsense|adsbygoogle|ko-fi|kofi|sponsor|donat/i);
    expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/);
  });

  it("keeps the 13+ notes and the approved licensing paragraph", () => {
    expect(text).toContain("Multiplayer races are for ages 13+.");
    expect(text).toContain("only share links where your audience is 13+.");
    expect(text).toContain(
      "That license covers the code and our current pug artwork. It doesn't give you any trademark rights in the PuggieType name, logo or pug mascot",
    );
    expect(text).toContain(
      "PuggieType is an independent project and is not affiliated with or endorsed by Monkeytype.",
    );
    expect(html).not.toContain("REWRITTEN");
  });

  it("is linked from the static footer", () => {
    expect(footer).toContain('<a href="/creators">Creators</a>');
  });
});
