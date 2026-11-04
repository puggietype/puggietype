import { readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { describe, it, expect } from "vitest";

import { renderLegalMarkdown } from "../../vite-plugins/legal-markdown";

const legalDir = path.resolve(__dirname, "../../src/legal");
const srcDir = path.resolve(__dirname, "../../src");

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
      "The 'Show my score on the leaderboard' setting defaults on, but a score is posted only when you press a Submit score button (Submit score to leaderboard, or Submit score & next test, & repeat or & retry saving).",
    );
    expect(md).toContain(
      "Solo scores are calculated on your device and only lightly checked by our server, so the Solo board is marked 'unverified'. Race scores are checked by our server. We may remove any score that looks cheated.",
    );
    expect(md).toContain(
      "Neon, LLC (a Databricks company), USA, database hosting for leaderboard scores (AWS us-west-2, Oregon). Covered by Neon's Data Processing Addendum; transfers from the EU/UK rely on Neon's Data Privacy Framework certification.",
    );
    expect(md).not.toContain("account data once accounts launch");
    expect(md).not.toContain("your rank");
  });

  it("contains no chat clauses", () => {
    for (const name of ["terms", "privacy"]) {
      const md = readFileSync(path.join(legalDir, `${name}.md`), "utf-8");
      expect(md).not.toMatch(/quick-chat messages|free-text nickname/i);
      expect(md).toContain("There is no chat");
    }
  });
});
