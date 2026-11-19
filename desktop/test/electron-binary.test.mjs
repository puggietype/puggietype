// CI guard (QA): the Electron binary must be installed. Without it the
// shell can't start and smoke checks would silently do nothing, so fail.
// Checks the path without loading the electron package: electron 45
// downloads a missing binary when it is loaded, which would hide a missing
// install.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** where electron's index.js would look, without running it */
export function electronBinaryPath(pkgDir) {
  const rel = fs.readFileSync(path.join(pkgDir, "path.txt"), "utf8").trim();
  return path.join(pkgDir, "dist", rel);
}

/** The real check, used for the installed package and the missing case. */
export function assertElectronInstalled(pkgDir) {
  assert.ok(
    fs.existsSync(path.join(pkgDir, "path.txt")),
    "electron binary not installed (run npx install-electron --no)",
  );
  const bin = electronBinaryPath(pkgDir);
  assert.ok(fs.existsSync(bin), `electron binary missing at ${bin}`);
  fs.accessSync(bin, fs.constants.X_OK);
}

describe("electron binary", () => {
  const req = createRequire(import.meta.url);
  const pkgDir = path.dirname(req.resolve("electron/package.json"));

  it("is installed and executable", () => {
    assertElectronInstalled(pkgDir);
  });

  it("does not load the electron package (that would download it)", () => {
    const src = fs.readFileSync(
      path.join(here, "electron-binary.test.mjs"),
      "utf8",
    );
    // loading it by any form, with or without a trailing semicolon
    assert.doesNotMatch(src, /require\(\s*["']electron["']\s*\)/);
    assert.doesNotMatch(src, /import\(\s*["']electron["']\s*\)/);
    assert.doesNotMatch(src, /from\s+["']electron["']/);
  });

  // QA PR34-BINTEST-WEAK: the same assertion must fail for a missing binary
  for (const [name, setup] of [
    ["no path.txt (binary never downloaded)", () => {}],
    [
      "path.txt but no binary",
      (d) => fs.writeFileSync(path.join(d, "path.txt"), "electron"),
    ],
    [
      "binary not executable",
      (d) => {
        fs.writeFileSync(path.join(d, "path.txt"), "electron");
        fs.mkdirSync(path.join(d, "dist"));
        fs.writeFileSync(path.join(d, "dist", "electron"), "", { mode: 0o644 });
      },
    ],
  ]) {
    it(
      `fails when ${name}`,
      { skip: process.platform === "win32" && name.includes("executable") },
      () => {
        const fake = fs.mkdtempSync(path.join(os.tmpdir(), "fake-electron-"));
        try {
          setup(fake);
          assert.throws(() => assertElectronInstalled(fake));
        } finally {
          fs.rmSync(fake, { recursive: true, force: true });
        }
      },
    );
  }
});
