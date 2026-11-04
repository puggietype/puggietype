#!/usr/bin/env node
// Stage the desktop app for packaging (no installer/Steam depot yet):
//   out/app/package.json, src/, web/ (the PLATFORM=steam build)
//   out/app/web/legal/  -> served as app://puggietype/legal/ (About links)
//   out/legal/          -> the same files next to the app, for the depot root
// GPL-3.0: ships LICENSE, NOTICE, Electron's LICENSE, Chromium's
// LICENSES.chromium.html and a source offer that names the exact commit.
// usage: node scripts/package.mjs [--dist ../frontend/dist] [--out out]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEGAL_FILES } from "../src/shell.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const repoRoot = path.resolve(desktopDir, "..");
export const SOURCE_REPO = "https://github.com/puggietype/puggietype";

export function sourceOffer({ commit, repo = SOURCE_REPO, electronVersion }) {
  if (!/^[0-9a-f]{40}$/.test(commit))
    throw new Error("commit must be a full sha");
  return [
    "PuggieType desktop: source code offer",
    "",
    "PuggieType is free software under the GNU General Public License,",
    "version 3 (see LICENSE.txt). It is based on Monkeytype by Miodec and",
    "its contributors. PuggieType is not affiliated with Monkeytype, Valve",
    "or Steam.",
    "",
    "The complete corresponding source code for this build is available at:",
    `  ${repo}/tree/${commit}`,
    `  ${repo}/archive/${commit}.tar.gz`,
    "",
    `This build was made from commit ${commit}.`,
    `It runs on Electron ${electronVersion} (MIT, see ELECTRON-LICENSE.txt),`,
    "which includes Chromium and other third-party software under the",
    "licenses listed in LICENSES.chromium.html.",
    "",
    "If you cannot download it, email support@puggietype.com and we will",
    "send the source to you for no more than the cost of sending it.",
    "",
  ].join("\n");
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
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot })
    .toString()
    .trim();
  // the source offer names HEAD, so the tree must match it exactly
  const dirty = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { cwd: repoRoot },
  )
    .toString()
    .trim();
  if (dirty && !process.argv.includes("--allow-dirty")) {
    console.error(
      "uncommitted changes: the source offer would not match this build (use --allow-dirty for local tests)",
    );
    process.exit(1);
  }
  const r = stagePackage({
    distDir: path.resolve(arg("dist", path.join(repoRoot, "frontend", "dist"))),
    outDir: path.resolve(arg("out", path.join(desktopDir, "out"))),
    commit,
  });
  console.log(`staged ${r.app} (licenses in ${r.legal}) from ${commit}`);
}
