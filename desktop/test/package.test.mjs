import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  SOURCE_REPO,
  releaseChecks,
  sourceOffer,
  stagePackage,
  steamTagName,
  tagSteamBuild,
} from "../scripts/package.mjs";
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

  it("the source offer is Legal's exact text (Ruling 7) for this commit", () => {
    const s = fs.readFileSync(path.join(servedLegal, "SOURCE.txt"), "utf8");
    const v = JSON.parse(
      fs.readFileSync(
        path.join(here, "../node_modules/electron/package.json"),
        "utf8",
      ),
    ).version;
    assert.equal(s, sourceOffer({ commit: COMMIT, electronVersion: v }));
    assert.ok(s.startsWith("PuggieType desktop: source code offer\n\n"));
    assert.ok(
      s.includes(
        `  ${SOURCE_REPO}/tree/${COMMIT}\n  ${SOURCE_REPO}/archive/${COMMIT}.tar.gz\n`,
      ),
    );
    assert.ok(s.includes(`This build was made from commit ${COMMIT}.`));
    assert.ok(
      s.includes(
        "GNU General Public License, version 3 only (see\nLICENSE.txt)",
      ),
    );
    assert.ok(s.includes(`https://github.com/electron/electron/tree/v${v}`));
    assert.ok(
      s.includes(
        "Written offer: for at least three years after we last distribute this\nbuild, any third party may email support@puggietype.com",
      ),
    );
    assert.ok(
      s.endsWith(
        "PuggieType is not affiliated with, endorsed or sponsored by Monkeytype,\nValve Corporation or Steam.\n",
      ),
    );
    assert.doesNotMatch(s, /puggietype is/);
    assert.throws(() =>
      sourceOffer({ commit: "abc", electronVersion: "45.0.0" }),
    );
  });

  it("ships the supporter pack art licence, and NOTICE keeps the pug art GPL", () => {
    const repo = path.resolve(here, "../..");
    assert.equal(
      fs.readFileSync(path.join(servedLegal, "DLC-ASSETS-LICENSE.txt"), "utf8"),
      fs.readFileSync(path.join(repo, "assets", "LICENSE"), "utf8"),
    );
    assert.match(
      fs.readFileSync(path.join(servedLegal, "DLC-ASSETS-LICENSE.txt"), "utf8"),
      /All rights reserved/,
    );
    assert.ok(
      fs
        .readFileSync(path.join(servedLegal, "NOTICE.txt"), "utf8")
        .includes(
          "Supporter pack artwork in assets/ is not covered by the GPL; see assets/LICENSE. All other artwork, including the current pug art, is GPL-3.0.",
        ),
    );
  });

  it("the app loads the bundled web build and serves the legal files over app://", () => {
    assert.ok(fs.existsSync(path.join(app, "src", "main.mjs")));
    assert.ok(fs.existsSync(path.join(app, "web", "index.html")));
    const pkg = JSON.parse(
      fs.readFileSync(path.join(app, "package.json"), "utf8"),
    );
    assert.equal(pkg.license, "GPL-3.0-only");
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

describe("release checks: pushed HEAD and steam-v tags (Legal P2-6)", () => {
  const sh = (cwd, ...args) =>
    execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
  function repoWithOrigin() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pt-rel-"));
    const origin = path.join(root, "origin.git");
    const work = path.join(root, "work");
    sh(root, "init", "-q", "--bare", "-b", "main", origin);
    sh(root, "clone", "-q", origin, work);
    sh(work, "config", "user.email", "t@example.invalid");
    sh(work, "config", "user.name", "t");
    fs.writeFileSync(path.join(work, "a.txt"), "1");
    sh(work, "add", "a.txt");
    sh(work, "commit", "-q", "-m", "one");
    sh(work, "push", "-q", "origin", "HEAD:main");
    return work;
  }

  it("tag names are steam-v<version>", () => {
    assert.equal(steamTagName("1.2.3"), "steam-v1.2.3");
    assert.throws(() => steamTagName("1.2"));
  });

  it("passes for a pushed HEAD, then tags it on origin; the same version can't tag another commit", () => {
    const work = repoWithOrigin();
    const r = releaseChecks({ cwd: work, version: "0.1.0" });
    assert.equal(r.tag, "steam-v0.1.0");
    assert.equal(r.tagExists, false);
    tagSteamBuild({ cwd: work, tag: r.tag, commit: r.commit });
    assert.ok(
      sh(work, "ls-remote", "--tags", "origin").includes(
        "refs/tags/steam-v0.1.0",
      ),
    );
    assert.equal(
      releaseChecks({ cwd: work, version: "0.1.0" }).tagExists,
      true,
    );
    fs.writeFileSync(path.join(work, "a.txt"), "2");
    sh(work, "commit", "-q", "-am", "two");
    sh(work, "push", "-q", "origin", "HEAD:main");
    assert.throws(
      () => releaseChecks({ cwd: work, version: "0.1.0" }),
      /already tags/,
    );
    assert.equal(
      releaseChecks({ cwd: work, version: "0.1.1" }).tagExists,
      false,
    );
  });

  it("refuses an unpushed HEAD or a dirty tree", () => {
    const work = repoWithOrigin();
    fs.writeFileSync(path.join(work, "a.txt"), "local");
    assert.throws(
      () => releaseChecks({ cwd: work, version: "0.1.0" }),
      /uncommitted/,
    );
    sh(work, "commit", "-q", "-am", "local only");
    assert.throws(
      () => releaseChecks({ cwd: work, version: "0.1.0" }),
      /not on origin\/main/,
    );
  });
});
