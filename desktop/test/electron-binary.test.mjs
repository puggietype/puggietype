// CI guard (QA): the Electron binary must be installed. Without it the
// shell can't start and smoke checks would silently do nothing, so fail.
// Checks the path without require("electron"): electron 45 downloads a
// missing binary on require, which would hide a missing install.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** where electron's index.js would look, without running it */
export function electronBinaryPath(pkgDir) {
  const rel = fs.readFileSync(path.join(pkgDir, "path.txt"), "utf8").trim();
  return path.join(pkgDir, "dist", rel);
}

describe("electron binary", () => {
  const require = createRequire(import.meta.url);
  const pkgDir = path.dirname(require.resolve("electron/package.json"));

  it("is installed and executable", () => {
    assert.ok(
      fs.existsSync(path.join(pkgDir, "path.txt")),
      "electron binary not installed (run npx install-electron --no)",
    );
    const bin = electronBinaryPath(pkgDir);
    assert.ok(fs.existsSync(bin), `electron binary missing at ${bin}`);
    fs.accessSync(bin, fs.constants.X_OK);
  });

  it("does not trigger electron's download (no require of the package)", () => {
    const src = fs.readFileSync(
      path.join(here, "electron-binary.test.mjs"),
      "utf8",
    );
    assert.doesNotMatch(src, /require\(\s*["']electron["']\s*\)\s*;/);
  });

  it("fails when the binary is missing", () => {
    const fake = fs.mkdtempSync(
      path.join(path.dirname(pkgDir), ".fake-electron-"),
    );
    try {
      fs.writeFileSync(path.join(fake, "path.txt"), "electron");
      assert.equal(fs.existsSync(electronBinaryPath(fake)), false);
    } finally {
      fs.rmSync(fake, { recursive: true, force: true });
    }
  });
});
