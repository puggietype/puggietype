#!/usr/bin/env node
// Check an unpacked installer build (electron-builder "dir" target) against
// the depot rules: nothing held (ticket helper, steam_api, steam_appid.txt,
// ads.txt) anywhere in the tree or inside app.asar, the GPL-3.0 bundle in
// resources/legal/, and app.asar holding only the staged app.
// usage: node scripts/check-installer.mjs dist-installers/linux-unpacked
// Reads files only: never spawns anything or talks to Steam.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEGAL_FILES } from "../src/shell.mjs";
import { isForbiddenDepotPath, scanDepotTree } from "./depot-allowlist.mjs";

const ASAR_TOP = ["package.json", "src", "web"];

/**
 * Pure check. tree: scanDepotTree() of the unpacked dir; resources: the
 * resources dir relative to it (posix); asarFiles: paths inside app.asar.
 * Returns violation strings; empty means allowed.
 */
export function installerViolations({ tree, resources, asarFiles }) {
  const v = [];
  for (const f of tree)
    if (isForbiddenDepotPath(f.path))
      v.push(`${f.path}: forbidden (held helper/SDK, app id or ads file)`);
  const res = tree
    .filter((f) => f.path.startsWith(`${resources}/`))
    .map((f) => ({ ...f, path: f.path.slice(resources.length + 1) }));
  const byPath = new Map(res.map((f) => [f.path, f]));
  if (!byPath.has("app.asar")) v.push(`${resources}/app.asar: missing`);
  for (const f of res) {
    const top = f.path.split("/")[0];
    if (top === "app" || top === "app.asar.unpacked")
      v.push(`${resources}/${f.path}: app must be packed in app.asar only`);
    if (top === "legal") {
      if (f.type !== "file") v.push(`${resources}/${f.path}: not a file`);
      else if (!LEGAL_FILES.some((n) => f.path === `legal/${n}`))
        v.push(`${resources}/${f.path}: legal/ holds only LEGAL_FILES`);
    }
  }
  for (const n of LEGAL_FILES) {
    const f = byPath.get(`legal/${n}`);
    if (!f) v.push(`${resources}/legal/${n}: missing`);
    else if (!(f.size > 0)) v.push(`${resources}/legal/${n}: empty`);
  }
  const inAsar = new Set(asarFiles);
  for (const p of asarFiles) {
    if (!ASAR_TOP.includes(p.split("/")[0]))
      v.push(`app.asar/${p}: outside package.json, src/ and web/`);
    if (isForbiddenDepotPath(p)) v.push(`app.asar/${p}: forbidden`);
  }
  for (const p of [
    "package.json",
    "src/main.mjs",
    "src/preload.cjs",
    "web/index.html",
    ...LEGAL_FILES.map((n) => `web/legal/${n}`),
  ])
    if (!inAsar.has(p)) v.push(`app.asar/${p}: missing`);
  return v;
}

/** resources/ (linux, win) or <name>.app/Contents/Resources (mac). */
export function findResources(unpacked) {
  if (fs.existsSync(path.join(unpacked, "resources", "app.asar")))
    return "resources";
  const app = fs.readdirSync(unpacked).find((n) => n.endsWith(".app"));
  if (app) return `${app}/Contents/Resources`;
  throw new Error(`no resources dir in ${unpacked}`);
}

/**
 * File paths inside an asar archive, from its JSON header (pickle: u32
 * sizes, then the header string at byte 16). Directories are not listed.
 */
export function asarFileList(asarPath) {
  const fd = fs.openSync(asarPath, "r");
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const json = Buffer.alloc(head.readUInt32LE(12));
    fs.readSync(fd, json, 0, json.length, 16);
    const out = [];
    const walk = (node, prefix) => {
      for (const [name, e] of Object.entries(node.files ?? {})) {
        if (e.files) walk(e, `${prefix}${name}/`);
        else out.push(`${prefix}${name}`);
      }
    };
    walk(JSON.parse(json.toString("utf8")), "");
    return out.sort();
  } finally {
    fs.closeSync(fd);
  }
}

export function checkInstaller(unpacked) {
  const resources = findResources(unpacked);
  const asarPath = path.join(unpacked, ...resources.split("/"), "app.asar");
  const asarFiles = fs.existsSync(asarPath) ? asarFileList(asarPath) : [];
  const v = installerViolations({
    tree: scanDepotTree(unpacked),
    resources,
    asarFiles,
  });
  if (v.length)
    throw new Error(
      `installer check failed for ${unpacked}:\n  - ${v.join("\n  - ")}`,
    );
  return { resources, asarFiles: asarFiles.length };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) {
    console.error("usage: check-installer.mjs <unpacked dir>...");
    process.exit(2);
  }
  try {
    for (const d of dirs) {
      const r = checkInstaller(path.resolve(d));
      console.log(`ok ${d} (${r.resources}, ${r.asarFiles} files in app.asar)`);
    }
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
}
