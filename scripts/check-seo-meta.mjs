#!/usr/bin/env node
// Checks the search/share metadata of every static page and the app shell:
// unique title/description/canonical, og:* and twitter:* tags, the share
// image, and that each JSON-LD block parses with the expected @type.
// Usage: node scripts/check-seo-meta.mjs [dir]  (default frontend/src; dist works too)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.resolve(process.argv[2] ?? path.join(root, "frontend/src"));
const IMAGE = "https://puggietype.com/images/og/puggietype-share.png";
const PAGE_TYPES = new Set([
  "WebSite",
  "WebPage",
  "Article",
  "AboutPage",
  "ContactPage",
  "FAQPage",
]);

const pages = [
  "index",
  "faq",
  "contact",
  "privacy",
  "terms",
  ...readdirSync(path.join(dir, "guide"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => `guide/${f.slice(0, -5)}`),
];

const errors = [];
const seen = { title: new Map(), description: new Map(), canonical: new Map() };

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function meta(html, attr, name) {
  const tags = html.match(/<meta\b[^>]*>/g) ?? [];
  for (const tag of tags) {
    const key = tag.match(new RegExp(`\\b${attr}="?([^"\\s>]+)"?`));
    if (key?.[1] !== name) continue;
    const content = tag.match(/\bcontent=(?:"([^"]*)"|([^\s>]+))/);
    return decode((content?.[1] ?? content?.[2] ?? "").trim());
  }
  return undefined;
}

function unique(kind, value, page) {
  const other = seen[kind].get(value);
  if (other !== undefined) errors.push(`${page}: ${kind} same as ${other}`);
  seen[kind].set(value, page);
}

function checkLdNode(node, page, top) {
  if (typeof node !== "object" || node === null) return;
  if (Array.isArray(node)) {
    for (const n of node) checkLdNode(n, page, false);
    return;
  }
  if ("@type" in node && typeof node["@type"] !== "string") {
    errors.push(`${page}: json-ld @type must be a string`);
  }
  if (top) {
    if (node["@context"] !== "https://schema.org") {
      errors.push(`${page}: json-ld @context is not https://schema.org`);
    }
    if (!PAGE_TYPES.has(node["@type"])) {
      errors.push(`${page}: unexpected top-level @type ${node["@type"]}`);
    }
    if (node.image !== IMAGE) errors.push(`${page}: json-ld image missing`);
  }
  if (node["@type"] === "Question") {
    if (typeof node.name !== "string") errors.push(`${page}: Question name`);
    if (node.acceptedAnswer?.["@type"] !== "Answer") {
      errors.push(`${page}: Question without an Answer`);
    }
  }
  if (node["@type"] === "Article") {
    for (const k of ["headline", "author", "publisher"]) {
      if (!(k in node)) errors.push(`${page}: Article without ${k}`);
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (k !== "@context") checkLdNode(v, page, false);
  }
}

for (const page of pages) {
  const file = path.join(dir, `${page}.html`);
  if (!existsSync(file)) {
    errors.push(`${page}: missing ${file}`);
    continue;
  }
  const html = readFileSync(file, "utf8");
  const title = decode(
    (html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").replace(/\s+/g, " "),
  ).trim();
  const description = meta(html, "name", "description");
  const canonical = html.match(
    /<link\b[^>]*rel="?canonical"?[^>]*href="?([^"\s>]+)/,
  )?.[1];

  if (title === "") {
    errors.push(`${page}: no <title>`);
  } else {
    unique("title", title, page);
  }
  if (!description) {
    errors.push(`${page}: no meta description`);
  } else {
    unique("description", description, page);
  }
  if (canonical === undefined) {
    errors.push(`${page}: no canonical`);
  } else {
    unique("canonical", canonical, page);
    const want = `https://puggietype.com/${page === "index" ? "" : page}`;
    if (canonical !== want) errors.push(`${page}: canonical ${canonical}`);
  }

  const required = {
    "og:title": ["property", undefined],
    "og:description": ["property", undefined],
    "og:url": ["property", canonical],
    "og:image": ["property", IMAGE],
    "og:image:width": ["property", "1200"],
    "og:image:height": ["property", "630"],
    "og:image:alt": ["property", undefined],
    "twitter:card": ["name", "summary_large_image"],
    "twitter:title": ["name", undefined],
    "twitter:description": ["name", undefined],
    "twitter:image": ["name", IMAGE],
  };
  for (const [name, [attr, want]] of Object.entries(required)) {
    const got = meta(html, attr, name);
    if (!got) {
      errors.push(`${page}: no ${name}`);
    } else if (want !== undefined && got !== want) {
      errors.push(`${page}: ${name} is ${got}, want ${want}`);
    }
  }

  const blocks = [
    ...html.matchAll(
      /<script\b[^>]*type="?application\/ld\+json"?[^>]*>([\s\S]*?)<\/script>/g,
    ),
  ];
  if (blocks.length === 0) errors.push(`${page}: no json-ld`);
  for (const [, body] of blocks) {
    try {
      checkLdNode(JSON.parse(body), page, true);
    } catch (e) {
      errors.push(`${page}: json-ld does not parse: ${e.message}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  console.error(`\n${errors.length} problem(s) in ${pages.length} pages`);
  process.exit(1);
}
console.log(`ok: ${pages.length} pages in ${path.relative(root, dir) || "."}`);
