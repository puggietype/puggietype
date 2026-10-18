#!/usr/bin/env node
// Fails if user-facing legal/static content contains internal placeholders or draft text.
// Scans content files only (markdown + legal HTML shells), never code.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const legalDir = path.join(root, "frontend/src/legal");
const files = [
  ...readdirSync(legalDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(legalDir, f)),
  ...["frontend/src/privacy.html", "frontend/src/terms.html"].map((f) =>
    path.join(root, f),
  ),
].filter(existsSync);

const common = [
  [/VERIFY/, "VERIFY placeholder"],
  [/\[\s*(\.\.\.|…|TBD|TODO|TK)\s*\]/i, "bracketed placeholder"],
  [/\[Drafting note/i, "drafting note"],
  [/risks\.md/i, "reference to risks.md"],
  [/parked-chat/i, "reference to parked-chat-clauses.md"],
  [/\bdrafts?\b/i, "the word 'draft'"],
];

let failures = 0;
for (const file of files) {
  const rel = path.relative(root, file);
  const isMd = file.endsWith(".md");
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const hits = common.filter(([re]) => re.test(line)).map(([, m]) => m);
      if (isMd) {
        // Any '[' left after removing markdown links and inline code is a placeholder.
        const stripped = line
          .replace(/`[^`]*`/g, "")
          .replace(/!?\[[^\]]*\]\([^)]*\)/g, "");
        if (stripped.includes("["))
          hits.push("stray '[' (bracketed placeholder)");
      }
      for (const h of new Set(hits)) {
        failures++;
        console.error(
          `${rel}:${i + 1}: ${h}\n    ${line.trim().slice(0, 160)}`,
        );
      }
    });
}
if (failures) {
  console.error(
    `\ncheck-placeholders: ${failures} problem(s) in user-facing legal content.`,
  );
  process.exit(1);
}
console.log(`check-placeholders: OK (${files.length} files)`);
