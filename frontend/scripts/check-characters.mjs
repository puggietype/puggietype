#!/usr/bin/env node
// Asset checks for static/images/characters (spec §6): viewBox, no scripts or
// handlers, colours only via theme vars (hex only as var() fallbacks, plus
// white/black catchlight details), <=40KB per frame, identical desk geometry
// across a dog's frames, and a per-dog gzip budget. Prints a size table.
//   pnpm check-characters
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { CHARACTER_IDS, FRAME_NAMES } from "./character-svg.mjs";

const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../static/images/characters",
);
const MAX_FRAME_BYTES = 40 * 1024;
const MAX_DOG_GZIP_BYTES = 60 * 1024;
// eye catchlights / pupils are fixed white/near-black by design
const ALLOWED_HEX = new Set(["#fff", "#ffffff", "#120d0b", "#1c1512"]);

const problems = [];
const rows = [];

/** desk slab geometry (registration must not move between frames) */
function deskHash(svg) {
  return [...svg.matchAll(/<path[^>]*fill="var\(--pug-desk[^>]*>/g)]
    .map((m) => m[0])
    .join("");
}

export function checkSvg(name, svg) {
  const out = [];
  if (
    !/^<svg[^>]*\sviewBox="0 0 512 512"/.test(svg) &&
    !name.endsWith("-head.svg")
  ) {
    out.push(`${name}: viewBox must be "0 0 512 512"`);
  }
  if (/<script/i.test(svg)) out.push(`${name}: contains <script>`);
  if (/\son[a-z]+\s*=/i.test(svg))
    out.push(`${name}: contains an event handler`);
  if (/<foreignObject|javascript:/i.test(svg))
    out.push(`${name}: unsafe content`);
  // luminance masks are black/white by definition
  const bare = svg
    .replace(/<mask\b[\s\S]*?<\/mask>/g, "")
    .replace(/var\(--[a-z0-9-]+, #[0-9A-Fa-f]{3,8}\)/g, "")
    .replace(/^<svg[^>]*>/, (root) => root.replace(/\scolor="[^"]*"/, ""));
  for (const [hex] of bare.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) {
    if (!ALLOWED_HEX.has(hex.toLowerCase())) {
      out.push(`${name}: hard-coded colour ${hex} outside a var() fallback`);
      break;
    }
  }
  return out;
}

for (const id of CHARACTER_IDS) {
  let raw = 0;
  let gz = 0;
  let max = 0;
  let desk;
  const files = [...FRAME_NAMES.map((f) => `${id}-${f}.svg`), `${id}-head.svg`];
  for (const file of files) {
    const p = path.join(DIR, id, file);
    if (!fs.existsSync(p)) {
      problems.push(`missing ${id}/${file}`);
      continue;
    }
    const buf = fs.readFileSync(p);
    const svg = buf.toString("utf8");
    problems.push(...checkSvg(file, svg));
    if (file.endsWith("-head.svg")) continue;
    if (buf.length > MAX_FRAME_BYTES) {
      problems.push(`${file}: ${buf.length} B > ${MAX_FRAME_BYTES} B`);
    }
    const hash = deskHash(svg);
    desk ??= hash;
    if (hash !== desk)
      problems.push(`${file}: desk geometry differs from idle`);
    raw += buf.length;
    gz += gzipSync(buf, { level: 9 }).length;
    max = Math.max(max, buf.length);
  }
  if (gz > MAX_DOG_GZIP_BYTES) {
    problems.push(`${id}: ${gz} B gzip > ${MAX_DOG_GZIP_BYTES} B`);
  }
  rows.push({ id, raw, gz, max });
}

const kb = (n) => (n / 1024).toFixed(1).padStart(6);
console.log("dog        9 frames raw   gzip   max frame (KB)");
for (const r of rows) {
  console.log(`${r.id.padEnd(10)} ${kb(r.raw)}      ${kb(r.gz)}  ${kb(r.max)}`);
}
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nall character assets ok");
