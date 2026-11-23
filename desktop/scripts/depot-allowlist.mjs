// Steam depot allowlist (Legal note 2026-11-04: "depot allowlist and
// redistributables re-review when the depot step lands").
//
// Content depot (root = package out/): only the staged app/ and legal/
// trees from scripts/package.mjs. DLC (Supporter Pack) depot (root =
// assets/supporter/): only the art licence and image artwork.
//
// ON HOLD: the unmerged PR #37 branch planned to ship
// resources/steam-ticket-helper/ and steam_api redistributables in the
// depot. That path is on hold (Legal ruling 2026-11-03: no Steamworks SDK of
// any kind, in-process or as a helper), so those files are forbidden in
// every depot here. Allowing them, or any other redistributable, needs a
// new Legal review first; Legal also re-reviews depot contents before any
// real upload.
//
// Pure checks (depotViolations, depotTemplateViolations) plus thin wrappers
// that read a tree or throw. Nothing here spawns a process or talks to Steam.
import fs from "node:fs";
import path from "node:path";
import { LEGAL_FILES } from "../src/shell.mjs";

export const STEAM_PLACEHOLDERS = {
  app: "__PUGGIE_STEAM_APP_ID__",
  content: "__PUGGIE_STEAM_DEPOT_CONTENT_ID__",
  dlc: "__PUGGIE_STEAM_DEPOT_DLC_ID__",
};

/** Every depot script must exclude these (debug symbols, OS junk). */
export const REQUIRED_FILE_EXCLUSIONS = [
  "*.pdb",
  ".DS_Store",
  "._*",
  "Thumbs.db",
  "desktop.ini",
  "*.log",
  "*.tmp",
];

/** Install-folder subdir the DLC depot writes to (never app/ or legal/). */
export const DLC_DEPOT_PATH = "supporter";

// Matched per path segment, case-insensitively. The held helper and
// Steamworks redistributables, the dev-only app id file, and the web
// flavor's ad account file (the steam build strips it).
const FORBIDDEN_SEGMENTS = [
  /^steam-ticket-helper(\.exe)?$/i,
  /^(lib)?steam_api(64)?\.(dll|so|dylib|lib)(\.\d+)*$/i,
  /^steam_appid\.txt$/i,
  /^ads\.txt$/i,
  // also catches globs and variants such as steam_api*.dll
  /steam-ticket-helper|steam_api|steam_appid/i,
];
const CONTENT_TOP = ["app", "legal"];
const DLC_LICENCES = ["LICENSE", "LICENSE.txt"];
const DLC_ART = /\.(png|jpe?g|webp|gif)$/i;
const DLC_LOCAL_PATHS = [
  ...DLC_LICENCES,
  ...["png", "jpg", "jpeg", "webp", "gif"].map((e) => `*.${e}`),
];

// Rendered scripts land in desktop/steam/build/; ContentRoot is relative
// to the script, so these are where each root must resolve (repo-relative).
const RENDER_DIR = "desktop/steam/build";
const CONTENT_ROOT = "desktop/out";
const DLC_ROOT = "assets/supporter";

/** True for a path (posix) naming a held helper/SDK, app id or ads file. */
export const isForbiddenDepotPath = (rel) =>
  rel.split("/").some((seg) => FORBIDDEN_SEGMENTS.some((re) => re.test(seg)));
const forbidden = isForbiddenDepotPath;

/**
 * Pure check of a depot file list. files: [{ path (posix, relative to the
 * depot root), size, type: "file" | "symlink" | "other" }].
 * Returns violation strings; empty means allowed.
 */
export function depotViolations(depot, files) {
  if (depot !== "content" && depot !== "dlc")
    throw new Error(`unknown depot: ${depot}`);
  const v = [];
  for (const f of files) {
    const top = f.path.split("/")[0];
    if (f.type !== "file") v.push(`${f.path}: not a regular file`);
    else if (forbidden(f.path))
      v.push(`${f.path}: forbidden (held helper/SDK, app id or ads file)`);
    else if (depot === "content") {
      if (!CONTENT_TOP.includes(top))
        v.push(`${f.path}: outside app/ and legal/`);
      else if (
        top === "legal" &&
        !LEGAL_FILES.some((n) => f.path === `legal/${n}`)
      )
        v.push(`${f.path}: legal/ holds only LEGAL_FILES`);
    } else if (!DLC_LICENCES.includes(f.path) && !DLC_ART.test(f.path)) {
      v.push(`${f.path}: DLC holds only the art licence and image artwork`);
    }
  }
  const byPath = new Map(files.map((f) => [f.path, f]));
  if (depot === "content") {
    for (const n of LEGAL_FILES) {
      const f = byPath.get(`legal/${n}`);
      if (!f) v.push(`legal/${n}: missing`);
      else if (!(f.size > 0)) v.push(`legal/${n}: empty`);
    }
  } else {
    const lic = DLC_LICENCES.map((n) => byPath.get(n)).filter(Boolean);
    if (!lic.some((f) => f.size > 0))
      v.push("LICENSE: the art licence is missing or empty");
  }
  return v;
}

/** Every entry under root (dirs recursed, not listed), posix-relative. */
export function scanDepotTree(root) {
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) walk(abs);
      else
        files.push({
          path: rel,
          size: st.size,
          type: st.isFile()
            ? "file"
            : st.isSymbolicLink()
              ? "symlink"
              : "other",
        });
    }
  };
  walk(root);
  return files;
}

export function assertDepotAllowlist({ depot, root }) {
  const v = depotViolations(depot, scanDepotTree(root));
  if (v.length)
    throw new Error(
      `depot allowlist (${depot}) failed for ${root}:\n  - ${v.join("\n  - ")}`,
    );
}

/**
 * Minimal Valve KeyValues (VDF) reader: quoted or bare tokens, { }, //
 * comments. Repeated keys become arrays. No escapes, no [$conditionals].
 */
export function parseVdf(text) {
  const tokens = [];
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (/\s/.test(c)) i++;
    else if (text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      i = nl < 0 ? text.length : nl;
    } else if (c === "{" || c === "}") {
      tokens.push({ t: c });
      i++;
    } else if (c === '"') {
      const end = text.indexOf('"', i + 1);
      if (end < 0) throw new Error("vdf: unterminated string");
      tokens.push({ t: "s", v: text.slice(i + 1, end) });
      i = end + 1;
    } else {
      const m = /^[^\s{}"]+/.exec(text.slice(i));
      tokens.push({ t: "s", v: m[0] });
      i += m[0].length;
    }
  }
  let p = 0;
  const obj = (nested) => {
    const o = {};
    for (;;) {
      const k = tokens[p++];
      if (!k) {
        if (nested) throw new Error("vdf: unclosed {");
        return o;
      }
      if (k.t === "}") {
        if (!nested) throw new Error("vdf: unexpected }");
        return o;
      }
      if (k.t !== "s") throw new Error("vdf: unexpected {");
      const val = tokens[p++];
      if (!val) throw new Error(`vdf: no value for ${k.v}`);
      if (val.t === "}") throw new Error("vdf: unexpected }");
      const value = val.t === "{" ? obj(true) : val.v;
      if (k.v in o) o[k.v] = [o[k.v], value].flat(1);
      else o[k.v] = value;
    }
  };
  return obj(false);
}

const list = (x) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const slash = (p) => String(p).replaceAll("\\", "/");
const normPath = (p) => path.posix.normalize(slash(p)).replace(/\/+$/, "");
const unsafe = (p) =>
  /^([a-z]:|\/)/i.test(slash(p)) || slash(p).split("/").includes("..");

function checkKeys(where, o, allowed, v) {
  if (!o || typeof o !== "object" || Array.isArray(o)) {
    v.push(`${where}: missing or repeated block`);
    return false;
  }
  for (const k of Object.keys(o))
    if (!allowed.includes(k)) v.push(`${where}: unexpected key ${k}`);
  return true;
}

function checkDepot(name, text, { id, root, mapping }, v) {
  let d;
  try {
    d = parseVdf(text).DepotBuild;
  } catch (err) {
    v.push(`${name}: ${err.message}`);
    return;
  }
  const allowed = ["DepotID", "ContentRoot", "FileMapping", "FileExclusion"];
  if (!checkKeys(`${name} DepotBuild`, d, allowed, v)) return;
  if (d.DepotID !== id) v.push(`${name}: DepotID must be ${id}`);
  // ".." is expected here; the exact resolved root is the guard.
  const cr = d.ContentRoot;
  if (
    typeof cr !== "string" ||
    /^([a-z]:|\/)/i.test(slash(cr)) ||
    normPath(path.posix.join(RENDER_DIR, slash(cr))) !== root
  )
    v.push(`${name}: ContentRoot must resolve to ${root}`);
  const maps = list(d.FileMapping);
  if (!maps.length) v.push(`${name}: no FileMapping`);
  for (const m of maps) {
    if (
      !checkKeys(
        `${name} FileMapping`,
        m,
        ["LocalPath", "DepotPath", "Recursive"],
        v,
      )
    )
      continue;
    const err = mapping(m);
    if (err) v.push(`${name}: ${m.LocalPath} -> ${m.DepotPath}: ${err}`);
  }
  const ex = list(d.FileExclusion);
  for (const e of REQUIRED_FILE_EXCLUSIONS)
    if (!ex.includes(e)) v.push(`${name}: missing FileExclusion ${e}`);
}

function contentMapping({ LocalPath: lp, DepotPath: dp }) {
  if (typeof lp !== "string" || typeof dp !== "string")
    return "LocalPath and DepotPath are required";
  if (unsafe(lp) || unsafe(dp)) return "absolute or .. path";
  const local = normPath(lp);
  const top = local.split("/")[0];
  if (!CONTENT_TOP.includes(top) || local === top)
    return "LocalPath must be under app/ or legal/";
  if (forbidden(local)) return "held helper/SDK, app id or ads file";
  if (normPath(dp) !== top) return `DepotPath must be ${top}`;
  return null;
}

function dlcMapping({ LocalPath: lp, DepotPath: dp, Recursive: r }) {
  if (typeof lp !== "string" || typeof dp !== "string")
    return "LocalPath and DepotPath are required";
  if (!DLC_LOCAL_PATHS.includes(lp))
    return `LocalPath must be one of ${DLC_LOCAL_PATHS.join(", ")}`;
  if (DLC_LICENCES.includes(lp) && r !== undefined && r !== "0")
    return "the licence mapping must not be recursive";
  if (unsafe(dp) || normPath(dp) !== DLC_DEPOT_PATH)
    return `DepotPath must be ${DLC_DEPOT_PATH}`;
  return null;
}

/**
 * Pure check of the committed templates' text:
 * { app_build, depot_content, depot_dlc }. Returns violation strings.
 */
export function depotTemplateViolations(t) {
  const v = [];
  let a;
  try {
    a = parseVdf(t.app_build).AppBuild;
  } catch (err) {
    v.push(`app_build: ${err.message}`);
  }
  const keys = ["AppID", "Desc", "Preview", "SetLive", "BuildOutput", "Depots"];
  if (a && checkKeys("app_build AppBuild", a, keys, v)) {
    if (a.AppID !== STEAM_PLACEHOLDERS.app)
      v.push(`app_build: AppID must be ${STEAM_PLACEHOLDERS.app}`);
    // A preview build scans and reports but uploads nothing; SetLive empty
    // so even a non-preview build could never go live on a branch.
    if (a.Preview !== "1") v.push('app_build: Preview must be "1"');
    if (a.SetLive !== undefined && a.SetLive !== "")
      v.push("app_build: SetLive must be empty");
    if (typeof a.BuildOutput !== "string" || unsafe(a.BuildOutput))
      v.push("app_build: BuildOutput must stay inside steam/build/");
    const want = {
      [STEAM_PLACEHOLDERS.content]: "depot_content.vdf",
      [STEAM_PLACEHOLDERS.dlc]: "depot_dlc.vdf",
    };
    if (JSON.stringify(a.Depots) !== JSON.stringify(want))
      v.push("app_build: Depots must be exactly the content and DLC scripts");
  }
  checkDepot(
    "depot_content",
    t.depot_content,
    {
      id: STEAM_PLACEHOLDERS.content,
      root: CONTENT_ROOT,
      mapping: contentMapping,
    },
    v,
  );
  checkDepot(
    "depot_dlc",
    t.depot_dlc,
    { id: STEAM_PLACEHOLDERS.dlc, root: DLC_ROOT, mapping: dlcMapping },
    v,
  );
  for (const [name, text] of Object.entries(t))
    if (/"\s*\d{3,}\s*"/.test(text)) v.push(`${name}: numeric id in template`);
  return v;
}

export function assertDepotTemplates(t) {
  const v = depotTemplateViolations(t);
  if (v.length)
    throw new Error(`depot templates failed:\n  - ${v.join("\n  - ")}`);
}
