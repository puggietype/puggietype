#!/usr/bin/env node
// Render desktop/steam/*.vdf.template into desktop/steam/build/ (gitignored)
// with real Steam ids. Writes files only: it never runs the SteamPipe
// tools or uploads anything. There is no App ID yet; nothing may be
// uploaded until Lead and Jake give an explicit go after real IDs exist.
//
// ids: env PUGGIE_STEAM_APP_ID, PUGGIE_STEAM_DEPOT_CONTENT_ID,
// PUGGIE_STEAM_DEPOT_DLC_ID, else desktop/steam/ids.local.json
// ({ "app", "content", "dlc" }, gitignored). Env wins.
// usage: node scripts/render-steam-vdf.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STEAM_PLACEHOLDERS,
  assertDepotTemplates,
} from "./depot-allowlist.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const steamDir = path.resolve(here, "..", "steam");
const TEMPLATES = ["app_build", "depot_content", "depot_dlc"];
const ENV = {
  app: "PUGGIE_STEAM_APP_ID",
  content: "PUGGIE_STEAM_DEPOT_CONTENT_ID",
  dlc: "PUGGIE_STEAM_DEPOT_DLC_ID",
};

export function readSteamIds({
  env = process.env,
  file = path.join(steamDir, "ids.local.json"),
} = {}) {
  const local = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {};
  return Object.fromEntries(
    Object.entries(ENV).map(([k, e]) => [k, env[e] ?? local[k]]),
  );
}

/** Substitute ids; throws on a bad id or a placeholder left over. */
export function renderSteamVdf(text, ids) {
  for (const k of Object.keys(STEAM_PLACEHOLDERS)) {
    if (!/^[1-9]\d*$/.test(String(ids[k] ?? "")))
      throw new Error(`${k} id must be a positive integer (${ENV[k]})`);
  }
  if (new Set(Object.keys(STEAM_PLACEHOLDERS).map((k) => ids[k])).size !== 3)
    throw new Error("app, content and dlc ids must all differ");
  let out = text;
  for (const [k, ph] of Object.entries(STEAM_PLACEHOLDERS))
    out = out.replaceAll(ph, String(ids[k]));
  const left = out.match(/__[A-Z0-9_]+__/);
  if (left) throw new Error(`placeholder left in output: ${left[0]}`);
  return out;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const templates = Object.fromEntries(
    TEMPLATES.map((n) => [
      n,
      fs.readFileSync(path.join(steamDir, `${n}.vdf.template`), "utf8"),
    ]),
  );
  let rendered;
  try {
    assertDepotTemplates(templates);
    const ids = readSteamIds();
    rendered = TEMPLATES.map((n) => [n, renderSteamVdf(templates[n], ids)]);
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
  const outDir = path.join(steamDir, "build");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [n, text] of rendered)
    fs.writeFileSync(path.join(outDir, `${n}.vdf`), text);
  console.log(
    `rendered ${TEMPLATES.length} scripts into ${outDir} (no upload)`,
  );
}
