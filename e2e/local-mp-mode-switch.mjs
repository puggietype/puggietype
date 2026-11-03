// Local-only manual check: a lobby switching mode between races must end each
// race with that race's own mode. Starts nothing itself: run a local
// puggietype-server and a frontend dev server proxying /ws to it first, e.g.
//
//   # server (other repo), solo races allowed, short countdown:
//   cd ../puggietype-server
//   PORT=2601 ALLOW_SOLO=1 COUNTDOWN_MS=1000 FEATURE_OPEN_ROOMS=1 \
//     node_modules/.bin/tsx src/index.ts
//   # frontend, /ws proxied to that server (or VITE_WS_URL=ws://localhost:2601/ws):
//   cd frontend
//   PUGGIE_WS_PROXY_TARGET=ws://localhost:2601 SERVER_OPEN=false \
//     node_modules/.bin/vite dev --port 3401
//   # then:
//   BASE_URL=http://localhost:3401 node e2e/local-mp-mode-switch.mjs
//
// Refuses non-local BASE_URLs. Exits non-zero on the first wrong ending.
import { chromium } from "@playwright/test";

const BASE = process.env["BASE_URL"] ?? "http://localhost:3401";
const { hostname } = new URL(BASE);
if (!["localhost", "127.0.0.1"].includes(hostname)) {
  console.error(`refusing non-local BASE_URL ${BASE}`);
  process.exit(2);
}
const HEADED = process.env["HEADED"] === "1";
/** mode switches to run, in order */
const PLAN = (process.env["PLAN"] ?? "time,words,time,words")
  .split(",")
  .map((m) => m.trim());
/** time races use 15s; words races 10 words */
const LENGTH = { time: 15, words: 10 };
/** OPEN=0: a private lobby joined by code (default: open, joined from the list) */
const OPEN = process.env["OPEN"] !== "0";
/** SOLO="mode:words,words:25": the players' own config before joining */
const SOLO = (process.env["SOLO"] ?? "")
  .split(",")
  .filter(Boolean)
  .map((kv) => kv.split(":"))
  .map(([k, v]) => [k, /^\d+$/.test(v) ? Number(v) : v]);
/** per-key delay (ms) for the host and the (slower) guest */
const DELAY = { host: 30, guest: Number(process.env["GUEST_DELAY"] ?? 90) };

const byTestId = (page, id) => page.locator(`[data-testid="${id}"]`);

async function configOf(page, key) {
  return page.evaluate((k) => window.__mt?.getConfig[k], key);
}

async function typeActiveWords(page, n, delay) {
  for (let i = 0; i < n; i++) {
    const letters = await page
      .locator("#words .word.active letter")
      .allTextContents();
    if (letters.length === 0) return;
    await page.keyboard.type(`${letters.join("")} `, { delay });
  }
}

/** one player's race: engine mode, then how it ends */
async function play(page, who, mode) {
  const delay = DELAY[who];
  await byTestId(page, "mp-race").waitFor();
  await byTestId(page, "mp-countdown").waitFor({ state: "hidden" });
  const engineMode = await configOf(page, "mode");
  const words = await page.locator("#words .word").count();
  const t0 = Date.now();
  // words: type every word, the race ends for us at once (waiting view with
  // our result, then the podium). time: type a few, the clock ends it.
  await typeActiveWords(page, 2, delay);
  const midMode = await configOf(page, "mode");
  await typeActiveWords(page, mode === "words" ? words - 2 : 1, delay);
  let ending = "podium";
  if (mode === "words") {
    // finishing must leave the test page right away
    await byTestId(page, "mp-waiting")
      .or(byTestId(page, "mp-podium"))
      .first()
      .waitFor({ timeout: 5_000 })
      .catch(() => (ending = "stuck on test page"));
  }
  await byTestId(page, "mp-podium").waitFor({ timeout: 30_000 });
  const tookMs = Date.now() - t0;
  const ok =
    engineMode === mode &&
    midMode === mode &&
    ending === "podium" &&
    (mode === "words" ? tookMs < 20_000 : tookMs >= 12_000);
  return {
    who,
    ok,
    engineMode: `${engineMode}/${midMode}`,
    words,
    tookMs,
    ending,
  };
}

async function race(host, guest, mode, index) {
  const label = `race ${index + 1} (${mode} ${LENGTH[mode]})`;
  await byTestId(host, `mp-mode-${mode}`).click();
  await byTestId(host, `mp-length-${LENGTH[mode]}`).click();
  // a settings change un-readies the guest
  await guest.waitForTimeout(300);
  await byTestId(guest, "mp-ready").click();
  await byTestId(host, "mp-start").click({ timeout: 10_000 });
  const results = await Promise.all([
    play(host, "host", mode),
    play(guest, "guest", mode),
  ]);
  let ok = true;
  for (const r of results) {
    console.log(
      `${r.ok ? "ok  " : "FAIL"} ${label} ${r.who}: engine mode=${r.engineMode}, words=${r.words}, ${r.ending} after ${r.tookMs}ms`,
    );
    if (!r.ok) ok = false;
  }
  const shots = process.env["SHOTS_DIR"];
  if (shots) {
    const tag = `${String(index + 1).padStart(2, "0")}-${label.replace(/[^a-z0-9]+/gi, "-")}`;
    await host.screenshot({ path: `${shots}/${tag}-host.png` });
    await guest.screenshot({ path: `${shots}/${tag}-guest.png` });
  }
  if (!ok) {
    await host.screenshot({
      path: `/tmp/mp-mode-switch-${index + 1}-host.png`,
    });
    await guest.screenshot({
      path: `/tmp/mp-mode-switch-${index + 1}-guest.png`,
    });
    return false;
  }
  await byTestId(host, "mp-rematch").click();
  await byTestId(host, "mp-lobby").waitFor();
  await byTestId(guest, "mp-lobby").waitFor();
  return true;
}

const browser = await chromium.launch({ headless: !HEADED });
let failed = false;
try {
  const pages = [];
  for (const who of ["host", "guest"]) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctx.addInitScript(() =>
      localStorage.setItem("puggie-mp-age-confirmed", "true"),
    );
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`${who} pageerror: ${e.message}`));
    pages.push(page);
  }
  const [host, guest] = pages;
  for (const page of pages) {
    await page.goto(`${BASE}/`);
    await page.waitForFunction(() => window.__mt !== undefined, null, {
      timeout: 60_000,
    });
    for (const [k, v] of SOLO) {
      await page.evaluate(([k, v]) => window.__mt.setConfig(k, v), [k, v]);
    }
  }
  await host.goto(`${BASE}/race`);
  await byTestId(host, "mp-create").waitFor({ timeout: 60_000 });
  // an open lobby, like the bug report
  if (OPEN) await byTestId(host, "mp-create-open").click();
  await byTestId(host, "mp-create").click();
  await byTestId(host, "mp-lobby").waitFor();
  const code = (await byTestId(host, "mp-room-code").innerText()).trim();
  if (OPEN) {
    await guest.goto(`${BASE}/race`);
    await byTestId(guest, "mp-open-room-join")
      .first()
      .click({ timeout: 60_000 });
  } else {
    await guest.goto(`${BASE}/r/${code}`);
  }
  await byTestId(guest, "mp-lobby").waitFor({ timeout: 60_000 });
  for (const [i, mode] of PLAN.entries()) {
    if (!(await race(host, guest, mode, i))) {
      failed = true;
      break;
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
