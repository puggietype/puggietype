#!/usr/bin/env node
// Stage the desktop app for packaging (no installer/Steam depot yet):
//   out/app/package.json, src/, web/ (the PLATFORM=steam build)
//   out/app/web/legal/  -> served as app://puggietype/legal/ (About links)
//   out/legal/          -> the same files next to the app, for the depot root
// GPL-3.0: ships LICENSE, NOTICE, Electron's LICENSE, Chromium's
// LICENSES.chromium.html, the supporter pack art licence and a source offer
// that names the exact (pushed, tagged) commit.
// usage: node scripts/package.mjs [--dist ../frontend/dist] [--out out] [--dev]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEGAL_FILES } from "../src/shell.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const repoRoot = path.resolve(desktopDir, "..");
export const SOURCE_REPO = "https://github.com/puggietype/puggietype";

// Legal review 2026-11-04, Ruling 7: exact text, do not edit without Legal.
export function sourceOffer({ commit, repo = SOURCE_REPO, electronVersion }) {
  if (!/^[0-9a-f]{40}$/.test(commit))
    throw new Error("commit must be a full sha");
  if (!/^\d+\.\d+\.\d+/.test(String(electronVersion))) {
    throw new Error("electronVersion must be x.y.z");
  }
  return `PuggieType desktop: source code offer

PuggieType is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License, version 3 only (see
LICENSE.txt). It comes with NO WARRANTY, to the extent permitted by law.
It is based on Monkeytype by Miodec and its contributors (see NOTICE.txt).

The complete Corresponding Source for this build, including the scripts
used to build it, is available at no charge from:
  ${repo}/tree/${commit}
  ${repo}/archive/${commit}.tar.gz
This build was made from commit ${commit}.

This app runs on Electron ${electronVersion} (MIT, see ELECTRON-LICENSE.txt),
which includes Chromium and other third-party components (some under the
LGPL, such as FFmpeg) listed in LICENSES.chromium.html. Their source is
available at https://github.com/electron/electron/tree/v${electronVersion}
and from the projects listed there.

Written offer: for at least three years after we last distribute this
build, any third party may email support@puggietype.com to get the
Corresponding Source on a physical medium or by download, for no more than
our cost of providing it.

PuggieType is not affiliated with, endorsed or sponsored by Monkeytype,
Valve Corporation or Steam.
`;
}

/** steam-v<version>; one tag per Steam build, never deleted (Ruling 6). */
export function steamTagName(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`bad version: ${version}`);
  return `steam-v${version}`;
}

const git = (cwd, args) =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();

/**
 * Release checks (Legal P2-6): clean tree, HEAD pushed to origin (contained
 * in origin/main or pointed at by a tag on origin), and a steam-v<version>
 * tag that is new or already on HEAD. Returns { commit, tag, tagExists }.
 */
export function releaseChecks({ cwd, version, remote = "origin" }) {
  const commit = git(cwd, ["rev-parse", "HEAD"]);
  if (git(cwd, ["status", "--porcelain", "--untracked-files=no"])) {
    throw new Error(
      "uncommitted changes: the source offer would not match this build",
    );
  }
  git(cwd, ["fetch", "--quiet", "--tags", remote]);
  const onMain = git(cwd, ["branch", "-r", "--contains", commit])
    .split("\n")
    .map((s) => s.trim())
    .includes(`${remote}/main`);
  const remoteTags = git(cwd, ["ls-remote", "--tags", remote])
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"));
  const taggedOnRemote = remoteTags.some(([sha]) => sha === commit);
  if (!onMain && !taggedOnRemote) {
    throw new Error(
      `HEAD ${commit} is not on ${remote}/main or a tag on ${remote}: push it first`,
    );
  }
  const tag = steamTagName(version);
  const existing = remoteTags.find(
    ([, ref]) => ref === `refs/tags/${tag}` || ref === `refs/tags/${tag}^{}`,
  );
  let tagExists = false;
  if (existing) {
    const peeled = git(cwd, ["rev-parse", `${tag}^{commit}`]);
    if (peeled !== commit)
      throw new Error(
        `${tag} already tags ${peeled}: bump the desktop version`,
      );
    tagExists = true;
  }
  return { commit, tag, tagExists };
}

/** Create and push the build tag (annotated). Never deletes or moves tags. */
export function tagSteamBuild({ cwd, tag, commit, remote = "origin" }) {
  git(cwd, ["tag", "-a", tag, commit, "-m", `Steam build ${tag} (${commit})`]);
  git(cwd, ["push", remote, `refs/tags/${tag}`]);
}

function electronDistDir() {
  return path.join(desktopDir, "node_modules", "electron", "dist");
}

export function stagePackage({
  distDir,
  outDir,
  commit,
  electronDist = electronDistDir(),
  electronVersion = JSON.parse(
    fs.readFileSync(
      path.join(desktopDir, "node_modules", "electron", "package.json"),
      "utf8",
    ),
  ).version,
}) {
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    throw new Error(`no web build at ${distDir} (run npm run build:web)`);
  }
  const need = {
    "LICENSE.txt": path.join(repoRoot, "LICENSE"),
    "NOTICE.txt": path.join(repoRoot, "NOTICE"),
    "ELECTRON-LICENSE.txt": path.join(electronDist, "LICENSE"),
    "LICENSES.chromium.html": path.join(electronDist, "LICENSES.chromium.html"),
    "DLC-ASSETS-LICENSE.txt": path.join(
      repoRoot,
      "assets",
      "supporter",
      "LICENSE",
    ),
  };
  for (const [name, src] of Object.entries(need)) {
    if (!fs.existsSync(src)) throw new Error(`missing ${name} source: ${src}`);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  const app = path.join(outDir, "app");
  fs.mkdirSync(app, { recursive: true });
  const pkg = JSON.parse(
    fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"),
  );
  fs.writeFileSync(
    path.join(app, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        private: true,
        license: pkg.license,
        type: "module",
        main: pkg.main,
      },
      null,
      2,
    ) + "\n",
  );
  fs.cpSync(path.join(desktopDir, "src"), path.join(app, "src"), {
    recursive: true,
  });
  fs.cpSync(distDir, path.join(app, "web"), { recursive: true });

  for (const dir of [
    path.join(app, "web", "legal"),
    path.join(outDir, "legal"),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, src] of Object.entries(need))
      fs.copyFileSync(src, path.join(dir, name));
    fs.writeFileSync(
      path.join(dir, "SOURCE.txt"),
      sourceOffer({ commit, electronVersion }),
    );
  }
  for (const f of LEGAL_FILES) {
    if (!fs.existsSync(path.join(app, "web", "legal", f)))
      throw new Error(`not staged: ${f}`);
  }
  return { app, legal: path.join(outDir, "legal") };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`);
    return i > 0 ? process.argv[i + 1] : d;
  };
  // Default is a release build for Steam: HEAD must be pushed, and the
  // build is tagged steam-v<version> on origin. --dev stages a local test
  // build only (never upload it): no checks, no tag.
  const dev = process.argv.includes("--dev");
  const version = JSON.parse(
    fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"),
  ).version;
  let commit;
  let release;
  if (dev) {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot })
      .toString()
      .trim();
  } else {
    try {
      release = releaseChecks({ cwd: repoRoot, version });
    } catch (err) {
      console.error(String(err instanceof Error ? err.message : err));
      process.exit(1);
    }
    commit = release.commit;
  }
  const r = stagePackage({
    distDir: path.resolve(arg("dist", path.join(repoRoot, "frontend", "dist"))),
    outDir: path.resolve(arg("out", path.join(desktopDir, "out"))),
    commit,
  });
  if (release && !release.tagExists) {
    tagSteamBuild({ cwd: repoRoot, tag: release.tag, commit });
  }
  console.log(
    `staged ${r.app} (licenses in ${r.legal}) from ${commit}` +
      (release
        ? ` tagged ${release.tag}`
        : " (dev build, not for distribution)"),
  );
}
