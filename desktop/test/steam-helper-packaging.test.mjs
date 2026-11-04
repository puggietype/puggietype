// Legal helper ruling 2026-11-04: no helper binary or steam_api file in the
// packaged app or in the GPL source (the GitHub archive of the commit is
// exactly the tracked files), and tools/steam-ticket-helper is README only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertNoSteamHelper,
  STEAM_HELPER_FILE_RX,
  stagePackage,
} from "../scripts/package.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const temps = [];
after(() => {
  for (const d of temps) fs.rmSync(d, { recursive: true, force: true });
});
function dist(extra) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pt-dist-"));
  temps.push(d);
  fs.writeFileSync(path.join(d, "index.html"), "<!doctype html>");
  if (extra) {
    fs.mkdirSync(path.join(d, path.dirname(extra)), { recursive: true });
    fs.writeFileSync(path.join(d, extra), "x");
  }
  return d;
}

describe("steam ticket helper is never packaged", () => {
  it("names helper and steam_api files", () => {
    for (const f of [
      "steam-ticket-helper",
      "a/steam-ticket-helper.exe",
      "steam_api64.dll",
      "libsteam_api.so",
      "libsteam_api.dylib",
      "steam_appid.txt",
    ])
      assert.match(f, STEAM_HELPER_FILE_RX, f);
    for (const f of ["steam-ticket-helper.md", "src/steam.mjs", "README.md"])
      assert.doesNotMatch(f, STEAM_HELPER_FILE_RX, f);
  });
  it("a clean package passes; a helper anywhere in it fails", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "pt-pkg-"));
    const { app } = stagePackage({
      distDir: dist(),
      outDir: out,
      commit: COMMIT,
    });
    const webDir = path.join(app, "web");
    const legalDir = path.join(out, "legal");
    assertNoSteamHelper({ appDir: app, webDir, legalDir });
    // a later depot step may add the helper next to the app, outside the check
    const depot = path.join(out, "resources", "steam-ticket-helper");
    fs.mkdirSync(depot, { recursive: true });
    fs.writeFileSync(path.join(depot, "steam-ticket-helper"), "x");
    fs.writeFileSync(path.join(out, "steam_api64.dll"), "x");
    assertNoSteamHelper({ appDir: app, webDir, legalDir });
    // but never inside the app folder or the web build
    fs.writeFileSync(path.join(app, "src", "steam_api64.dll"), "x");
    assert.throws(
      () => assertNoSteamHelper({ appDir: app, webDir, legalDir }),
      /\(app\)/,
    );
    fs.rmSync(path.join(app, "src", "steam_api64.dll"));
    fs.writeFileSync(path.join(webDir, "steam-ticket-helper"), "x");
    assert.throws(
      () => assertNoSteamHelper({ appDir: app, webDir, legalDir }),
      /must not be packaged/,
    );
    fs.rmSync(path.join(webDir, "steam-ticket-helper"));
    // nor in out/legal (PKG-HELPER-SCOPE)
    fs.writeFileSync(path.join(legalDir, "libsteam_api.so"), "x");
    assert.throws(
      () => assertNoSteamHelper({ appDir: app, webDir, legalDir }),
      /\(legal\)/,
    );
    for (const bad of [
      "steam-ticket-helper/steam-ticket-helper",
      "x/steam_api64.dll",
    ]) {
      const o = fs.mkdtempSync(path.join(os.tmpdir(), "pt-pkg-"));
      assert.throws(
        () => stagePackage({ distDir: dist(bad), outDir: o, commit: COMMIT }),
        /must not be packaged/,
      );
      fs.rmSync(o, { recursive: true, force: true });
    }
    fs.rmSync(out, { recursive: true, force: true });
  });
  it("the GPL source (tracked files) has no helper binary or SDK file", () => {
    const files = execFileSync("git", ["ls-files"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
    assert.deepEqual(
      files.filter((f) => STEAM_HELPER_FILE_RX.test(f)),
      [],
    );
    assert.deepEqual(
      files.filter((f) => /steamworks|sdk\/public\/steam/i.test(f)),
      [],
    );
  });
  it("tools/steam-ticket-helper holds only the README", () => {
    const dir = path.join(repoRoot, "tools", "steam-ticket-helper");
    assert.deepEqual(fs.readdirSync(dir), ["README.md"]);
  });
});
