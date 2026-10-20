#!/usr/bin/env node
// Ad bundle guard (legal/ads-changeset.md §4), run after `vite build`:
//  - no other ad, analytics or error-reporting network anywhere in dist
//  - googlesyndication only in the AdSense chunk (js/adsense.*.js) and the
//    CSP in _headers
//  - the AdSense chunk is never loaded at startup (not referenced by an html
//    page nor statically imported by anything that is)
//  - ads-off builds (VITE_ADS_ENABLED != "true"): googlesyndication in no
//    file at all and no AdSense chunk
// Usage: node scripts/check-ad-bundle.mjs [distDir] [--ads=on|off]
// (default: frontend/dist, ads mode from VITE_ADS_ENABLED in the env or frontend/.env*)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const FORBIDDEN =
  /googletagmanager|google-analytics|sentry|nitropay|playwire/i;
export const ADSENSE = /googlesyndication/i;
export const ADSENSE_CHUNK = /^js\/adsense\.[\w-]+\.js$/;
// code and markup; word lists and quotes (languages/, quotes/) are data
const SCANNED = /\.(js|mjs|html|css|json|webmanifest)$|^_headers$|^_redirects$/;
const DATA_DIRS = ["languages/", "quotes/", "challenges/", "funbox/"];

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

function isScanned(rel) {
  if (DATA_DIRS.some((d) => rel.startsWith(d))) return false;
  return SCANNED.test(path.posix.basename(rel)) || SCANNED.test(rel);
}

/** js files an html page loads, plus everything they statically import */
export function startupChunks(files, read) {
  const queue = [];
  for (const rel of files.filter((f) => f.endsWith(".html"))) {
    const html = read(rel);
    for (const [, ref] of html.matchAll(/(?:src|href)="\/?(js\/[^"]+\.js)"/g)) {
      queue.push(ref);
    }
  }
  const seen = new Set();
  while (queue.length > 0) {
    const rel = queue.pop();
    if (seen.has(rel) || !files.includes(rel)) continue;
    seen.add(rel);
    const code = read(rel);
    const dir = path.posix.dirname(rel);
    // static imports only: `import ... from "./x.js"` and `import "./x.js"`
    for (const [, spec] of code.matchAll(
      /(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+\.js)["']/g,
    )) {
      queue.push(path.posix.normalize(path.posix.join(dir, spec)));
    }
  }
  return seen;
}

export function checkAdBundle(files, read, adsEnabled) {
  const errors = [];
  const scanned = files.filter(isScanned);
  for (const rel of scanned) {
    const text = read(rel);
    const forbidden = text.match(FORBIDDEN);
    if (forbidden !== null) {
      errors.push(`${rel}: forbidden third party "${forbidden[0]}"`);
    }
    if (!ADSENSE.test(text)) continue;
    if (!adsEnabled) {
      errors.push(`${rel}: googlesyndication in an ads-off build`);
    } else if (!ADSENSE_CHUNK.test(rel) && rel !== "_headers") {
      errors.push(`${rel}: googlesyndication outside the AdSense chunk`);
    }
  }
  const adChunks = files.filter((f) => ADSENSE_CHUNK.test(f));
  if (!adsEnabled && adChunks.length > 0) {
    errors.push(`AdSense chunk in an ads-off build: ${adChunks.join(", ")}`);
  }
  const startup = startupChunks(files, read);
  for (const chunk of adChunks) {
    if (startup.has(chunk)) {
      errors.push(`${chunk}: AdSense chunk is loaded at startup`);
    }
  }
  return errors;
}

function envFlag() {
  if (process.env["VITE_ADS_ENABLED"] !== undefined) {
    return process.env["VITE_ADS_ENABLED"] === "true";
  }
  // vite also reads frontend/.env, .env.production (and .local variants)
  for (const name of [
    ".env.production.local",
    ".env.local",
    ".env.production",
    ".env",
  ]) {
    const file = path.join(ROOT, "frontend", name);
    if (!existsSync(file)) continue;
    const match = readFileSync(file, "utf8").match(
      /^\s*VITE_ADS_ENABLED\s*=\s*["']?([^"'\s#]*)/m,
    );
    if (match) return match[1] === "true";
  }
  return false;
}

function main() {
  const args = process.argv.slice(2);
  const modeArg = args.find((a) => a.startsWith("--ads="));
  const dist = path.resolve(
    args.find((a) => !a.startsWith("--")) ??
      path.join(ROOT, "frontend", "dist"),
  );
  if (!existsSync(dist)) {
    console.error(`check-ad-bundle: ${dist} does not exist, build first`);
    process.exit(1);
  }
  const adsEnabled = modeArg ? modeArg === "--ads=on" : envFlag();
  const files = walk(dist);
  const read = (rel) => readFileSync(path.join(dist, rel), "utf8");
  const errors = checkAdBundle(files, read, adsEnabled);
  if (errors.length > 0) {
    console.error(`check-ad-bundle: FAILED (ads ${adsEnabled ? "on" : "off"})`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `check-ad-bundle: ok (ads ${adsEnabled ? "on" : "off"}, ${files.length} files)`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
