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
      "When you finish an eligible test or race, we may add your result to a public leaderboard: your rank, your randomly assigned nickname, and your speed (wpm), accuracy and raw speed. We save this in our database, which is hosted for us by Neon on Amazon Web Services servers in Oregon, USA. We don't store your IP address or any other identifier with it. Daily, weekly and monthly boards are cleared when each period ends. All-time boards keep scores for up to 12 months. Each board shows only its top 100 scores, and lower scores are deleted. You can turn off 'Show my score on the leaderboard' before submitting, or email support@puggietype.com with your nickname and the board to have a score removed. We may remove scores that look cheated or that break our rules.",
    );
  });

  it("contains no chat clauses", () => {
    for (const name of ["terms", "privacy"]) {
      const md = readFileSync(path.join(legalDir, `${name}.md`), "utf-8");
      expect(md).not.toMatch(/quick-chat messages|free-text nickname/i);
      expect(md).toContain("There is no chat");
    }
  });
});
