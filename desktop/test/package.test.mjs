import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SOURCE_REPO, sourceOffer, stagePackage } from "../scripts/package.mjs";
import {
  LEGAL_FILES,
  isLegalUrl,
  legalWindowOptions,
  resolveAppPath,
} from "../src/shell.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

function fakeDist() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pt-dist-"));
  fs.writeFileSync(
    path.join(d, "index.html"),
    "<!doctype html><title>pt</title>",
  );
  return d;
}

describe("packaged output (GPL source bundling)", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "pt-pkg-"));
  const { app, legal } = stagePackage({
    distDir: fakeDist(),
    outDir: out,
    commit: COMMIT,
  });
  const servedLegal = path.join(app, "web", "legal");

  it("ships LICENSE, NOTICE, the Electron and Chromium licenses and a source offer, twice", () => {
    for (const dir of [servedLegal, legal]) {
      for (const f of LEGAL_FILES)
        assert.ok(fs.statSync(path.join(dir, f)).size > 0, `${dir}/${f}`);
    }
  });

  it("license texts are the real ones", () => {
    const repo = path.resolve(here, "../..");
    assert.equal(
      fs.readFileSync(path.join(servedLegal, "LICENSE.txt"), "utf8"),
      fs.readFileSync(path.join(repo, "LICENSE"), "utf8"),
    );
    assert.match(
      fs.readFileSync(path.join(servedLegal, "LICENSE.txt"), "utf8"),
      /GNU GENERAL PUBLIC LICENSE\s+Version 3/,
    );
    assert.match(
      fs.readFileSync(path.join(servedLegal, "NOTICE.txt"), "utf8"),
      /modified version of Monkeytype/,
    );
    assert.match(
      fs.readFileSync(path.join(servedLegal, "ELECTRON-LICENSE.txt"), "utf8"),
      /Copyright.*Electron|MIT|Permission is hereby granted/,
    );
    assert.match(
      fs.readFileSync(path.join(servedLegal, "LICENSES.chromium.html"), "utf8"),
      /Chromium/,
    );
  });

  it("the source offer names the exact commit and the repo", () => {
    const s = fs.readFileSync(path.join(servedLegal, "SOURCE.txt"), "utf8");
    assert.ok(s.includes(`${SOURCE_REPO}/tree/${COMMIT}`));
    assert.ok(s.includes(`${SOURCE_REPO}/archive/${COMMIT}.tar.gz`));
    assert.match(s, /GNU General Public License,\s+version 3/);
    assert.match(s, /not affiliated with Monkeytype, Valve\s+or Steam/);
    assert.throws(() => sourceOffer({ commit: "abc", electronVersion: "45" }));
  });

  it("the app loads the bundled web build and serves the legal files over app://", () => {
    assert.ok(fs.existsSync(path.join(app, "src", "main.mjs")));
    assert.ok(fs.existsSync(path.join(app, "web", "index.html")));
    const pkg = JSON.parse(
      fs.readFileSync(path.join(app, "package.json"), "utf8"),
    );
    assert.equal(pkg.license, "GPL-3.0");
    assert.equal(pkg.main, "src/main.mjs");
    for (const f of LEGAL_FILES) {
      assert.equal(
        resolveAppPath(path.join(app, "web"), `app://puggietype/legal/${f}`),
        path.join(servedLegal, f),
      );
    }
  });

  it("refuses to package without a web build", () => {
    assert.throws(() =>
      stagePackage({
        distDir: os.tmpdir() + "/nope",
        outDir: out,
        commit: COMMIT,
      }),
    );
  });
});

describe("license viewer", () => {
  it("only our legal files open in the viewer window", () => {
    assert.equal(isLegalUrl("app://puggietype/legal/SOURCE.txt"), true);
    assert.equal(isLegalUrl("app://puggietype/legal/../index.html"), false);
    assert.equal(isLegalUrl("app://puggietype/legal/other.txt"), false);
    assert.equal(isLegalUrl("https://puggietype.com/legal/SOURCE.txt"), false);
    const w = legalWindowOptions().webPreferences;
    assert.equal(w.sandbox, true);
    assert.equal(w.contextIsolation, true);
    assert.equal(w.nodeIntegration, false);
    assert.equal("preload" in w, false);
  });
});
