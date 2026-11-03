#!/usr/bin/env node
// Renders the 1200x630 share image (og:image / twitter:image) from our own
// art: the typing pug (static/images/pug) and the Lexend webfonts.
// Usage: node scripts/og-image.mjs [out.png]
// Needs the playwright chromium (pnpm exec playwright install chromium).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = path.join(root, "frontend/static");
const out =
  process.argv[2] ?? path.join(staticDir, "images/og/puggietype-share.png");

const read = (p) => readFileSync(path.join(staticDir, p));
const font = (p) => `data:font/woff2;base64,${read(p).toString("base64")}`;
const pug = read("images/pug/pug-blink.svg").toString("utf8");

// puggie dark, the app's default theme
const html = `<!doctype html>
<html><head><style>
  @font-face { font-family: Lexend; font-weight: 400; src: url(${font("webfonts/Lexend-Regular.woff2")}); }
  @font-face { font-family: Lexend; font-weight: 600; src: url(${font("webfonts/Lexend-SemiBold.woff2")}); }
  :root { --bg: #161514; --main: #e8a96b; --sub: #77706a; --sub-alt: #211f1d; --text: #ece6dd; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body {
    background: var(--bg); color: var(--text); font-family: Lexend, sans-serif;
    display: grid; grid-template-columns: 470px 1fr; align-items: center;
    box-sizing: border-box; padding: 0 80px 0 50px;
  }
  .pug { width: 470px; height: 470px; }
  .pug svg { width: 100%; height: 100%; display: block; }
  h1 { font-weight: 600; font-size: 104px; line-height: 1; margin: 0; letter-spacing: -2px; }
  h1 span { color: var(--main); }
  p { font-size: 40px; line-height: 1.3; margin: 28px 0 0; color: var(--text); opacity: 0.72; }
  .url {
    display: inline-block; margin-top: 44px; font-size: 28px; color: var(--main);
    background: var(--sub-alt); border-radius: 14px; padding: 12px 24px;
  }
</style></head><body>
  <div class="pug">${pug}</div>
  <div>
    <h1>Puggie<span>Type</span></h1>
    <p>typing tests &amp;<br />multiplayer races</p>
    <div class="url">puggietype.com</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, type: "png" });
  console.log(`wrote ${path.relative(root, out)}`);
} finally {
  await browser.close();
}
