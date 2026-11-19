// QA P2 DESKTOP-NODETEST-EXIT: a suite whose setup throws must fail the run
// (non-zero exit), and setup must not sit in a describe body.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function withoutTestContext() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

describe("node --test setup failures", () => {
  it("a throw in before() exits non-zero", () => {
    const r = spawnSync(
      process.execPath,
      ["--test", path.join(here, "fixtures", "setup-throws.mjs")],
      // a fresh run, not a child reporting to this one
      { encoding: "utf8", env: withoutTestContext() },
    );
    assert.notEqual(r.status, 0, r.stdout);
    assert.match(r.stdout, /staging failed/);
  });
  it("package.test.mjs stages the package in before(), not the describe body", () => {
    const src = fs.readFileSync(path.join(here, "package.test.mjs"), "utf8");
    const at = src.indexOf('describe("packaged output');
    const body = src.slice(at, src.indexOf("\n  it(", at));
    assert.match(body, /before\(\(\) => \{[\s\S]*stagePackage\(/);
    assert.doesNotMatch(
      body.replace(/before\(\(\) => \{[\s\S]*?\n {2}\}\);/, ""),
      /stagePackage\(/,
    );
  });
});
