#!/usr/bin/env node
// Submits the sitemap URLs to IndexNow (Bing, Yandex, ... share submissions).
// Usage: node scripts/indexnow-ping.mjs [--remote] [--dry-run]
//   --remote   read https://puggietype.com/sitemap.xml instead of the local copy
//   --dry-run  print the request body, send nothing
// The key file frontend/static/<key>.txt must be live before a real ping.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "puggietype.com";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = path.join(root, "frontend/static");

const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (arg !== "--remote" && arg !== "--dry-run") {
    console.error(`unknown argument: ${arg}`);
    process.exit(2);
  }
}

const keyFile = readdirSync(staticDir).find((f) =>
  /^[0-9a-f]{32}\.txt$/.test(f),
);
if (keyFile === undefined) {
  console.error(`no <32-hex>.txt key file in ${staticDir}`);
  process.exit(1);
}
const key = readFileSync(path.join(staticDir, keyFile), "utf8").trim();
if (`${key}.txt` !== keyFile) {
  console.error(`${keyFile} must contain exactly its own key`);
  process.exit(1);
}

let sitemap;
if (args.has("--remote")) {
  const res = await fetch(`https://${HOST}/sitemap.xml`);
  if (!res.ok) {
    console.error(`sitemap fetch failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  sitemap = await res.text();
} else {
  sitemap = readFileSync(path.join(staticDir, "sitemap.xml"), "utf8");
}

const urlList = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
  .map((m) => m[1])
  .filter((u) => new URL(u).host === HOST);
if (urlList.length === 0) {
  console.error("no puggietype.com urls in the sitemap");
  process.exit(1);
}

const body = {
  host: HOST,
  key,
  keyLocation: `https://${HOST}/${key}.txt`,
  urlList,
};

if (args.has("--dry-run")) {
  console.log(`dry run: would POST ${urlList.length} urls to ${ENDPOINT}`);
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});
// 200 ok, 202 accepted (key validation pending), 400/403/422/429 errors
console.log(`${res.status} ${res.statusText} (${urlList.length} urls)`);
const text = await res.text();
if (text !== "") console.log(text);
process.exit(res.ok ? 0 : 1);
