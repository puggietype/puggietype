// Local-only race-start profile: one measured browser player (the host) plus
// PLAYERS-1 guests, against a local puggietype-server and dev frontend (see
// e2e/local-mp-ready.mjs for how to start both). Records, on the host page:
// rAF frame gaps, longtask and long-animation-frame entries, and WebSocket
// messages/s by type, in three windows around the countdown's end:
//   countdown  race:countdown received .. startAt
//   go         startAt .. +1.5 s (everyone starts typing, dogs/carets wake)
//   steady     +2 s .. +8 s
//
//   BASE_URL=http://localhost:3411 WS_URL=ws://localhost:2611/ws PLAYERS=8 \
//     RUNS=3 OUT=/tmp/perf-8.json node e2e/local-mp-perf.mjs
//
// GUESTS=ws (default) races the guests as raw WebSocket clients that send
// progress like the frontend (10/s, ~70-130 wpm), so only the host renders and
// CPU contention between browsers doesn't blur the numbers. GUESTS=browser
// uses real pages typing on the keyboard. CPU_THROTTLE (default 4) slows the
// measured page via CDP. PROFILE=/tmp/x also saves a CPU profile and a
// timeline trace of the first run. SHOTS_DIR saves perf-*.png.
// Refuses non-local URLs.
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env["BASE_URL"] ?? "http://localhost:3411";
const WS_URL = process.env["WS_URL"] ?? "ws://localhost:2611/ws";
for (const url of [BASE, WS_URL]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    console.error(`refusing non-local URL ${url}`);
    process.exit(2);
  }
}
const PLAYERS = Number(process.env["PLAYERS"] ?? 3);
const RUNS = Number(process.env["RUNS"] ?? 3);
const GUESTS = process.env["GUESTS"] ?? "ws";
const LABEL = process.env["LABEL"] ?? `${PLAYERS}p-${GUESTS}`;
const OUT = process.env["OUT"];
const SHOTS = process.env["SHOTS_DIR"];
/** CDP CPU slowdown on the measured page (this box is far faster than a laptop) */
const THROTTLE = Number(process.env["CPU_THROTTLE"] ?? 4);
/** path prefix: run 0 also writes <PROFILE>.cpuprofile and <PROFILE>-trace.json */
const PROFILE = process.env["PROFILE"];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const byTestId = (page, id) => page.locator(`[data-testid="${id}"]`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function eventually(fn, timeout = 10_000) {
  const until = Date.now() + timeout;
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() > until) return false;
    await sleep(100);
  }
}

/** runs in the page before any app code */
function instrument() {
  const perf = { frames: [], longtasks: [], loafs: [] };
  window.__perf = perf;
  const loop = (t) => {
    perf.frames.push(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      perf.longtasks.push({ start: e.startTime, duration: e.duration });
    }
  }).observe({ type: "longtask", buffered: true });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        perf.loafs.push({
          start: e.startTime,
          duration: e.duration,
          blocking: e.blockingDuration,
          styleAndLayout:
            e.styleAndLayoutStart > 0
              ? e.startTime + e.duration - e.styleAndLayoutStart
              : 0,
          scripts: e.scripts.map((s) => ({
            invoker: s.invoker,
            fn: s.sourceFunctionName,
            src: (s.sourceURL ?? "").replace(/^.*\/(src|node_modules)\//, ""),
            duration: s.duration,
            forcedLayout: s.forcedStyleAndLayoutDuration,
          })),
        });
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch {
    // no LoAF in this browser
  }
}

/** a scripted racer over a raw socket, sending progress like the frontend */
function wsGuest(code, wpm) {
  const ws = new WebSocket(WS_URL, {
    headers: { Origin: new URL(BASE).origin },
  });
  const send = (m) => ws.send(JSON.stringify(m));
  let timer;
  const done = new Promise((resolve, reject) => {
    ws.addEventListener("error", (e) => reject(new Error(String(e.message))));
    ws.addEventListener("open", () =>
      send({ type: "hello", ageConfirmed: true }),
    );
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === "welcome") send({ type: "room:join", code });
      if (msg.type === "room:state" && msg.phase === "lobby") {
        const me = msg.players.find((p) => p.id === ws.myId);
        if (me !== undefined && !me.ready) {
          send({ type: "player:ready", ready: true });
        }
      }
      if (msg.type === "welcome") ws.myId = msg.playerId;
      if (msg.type === "race:countdown") {
        const { startAt, words } = msg;
        const charsPerMs = (wpm * 5) / 60_000;
        clearInterval(timer);
        setTimeout(
          () => {
            const t0 = Date.now();
            timer = setInterval(() => {
              const testMs = Date.now() - t0;
              let chars = Math.floor(testMs * charsPerMs);
              let wordIndex = 0;
              while (
                wordIndex < words.length &&
                chars > words[wordIndex].length
              ) {
                chars -= words[wordIndex].length + 1;
                wordIndex++;
              }
              send({
                type: "race:progress",
                wordIndex,
                charIndex: Math.max(0, chars),
                testMs,
                wpm,
                errors: 0,
              });
            }, 100);
          },
          Math.max(0, startAt - Date.now()),
        );
      }
      if (msg.type === "race:results") {
        clearInterval(timer);
        resolve();
      }
    });
  });
  return { ws, done, close: () => (clearInterval(timer), ws.close()) };
}

async function typeLoop(page, startAt, until, delay) {
  await sleep(startAt - Date.now() + 50);
  await byTestId(page, "mp-countdown").waitFor({ state: "hidden" });
  while (Date.now() < until) {
    const letters = await page
      .locator("#words .word.active letter")
      .allTextContents();
    if (letters.length === 0) return;
    await page.keyboard.type(`${letters.join("")} `, { delay });
  }
}

async function newPlayer(browser, who) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addInitScript(() =>
    localStorage.setItem("puggie-mp-age-confirmed", "true"),
  );
  await ctx.addInitScript(instrument);
  // floor: the same race with opponents (dogs + carets) hidden
  if (process.env["OPPONENTS_OFF"] === "1" && who === "host") {
    await ctx.addInitScript(() =>
      localStorage.setItem("puggie-mp-show-carets", "false"),
    );
  }
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`${who} pageerror: ${e.message}`));
  return { ctx, page };
}

function windowStats(frames, longtasks, loafs, from, to) {
  const gaps = [];
  for (let i = 1; i < frames.length; i++) {
    if (frames[i] >= from && frames[i] < to)
      gaps.push(frames[i] - frames[i - 1]);
  }
  gaps.sort((a, b) => a - b);
  const lt = longtasks.filter((t) => t.start >= from && t.start < to);
  const lf = loafs.filter((t) => t.start >= from && t.start < to);
  const pct = (q) =>
    gaps[Math.min(gaps.length - 1, Math.floor(q * gaps.length))] ?? 0;
  return {
    frames: gaps.length,
    p95Gap: round(pct(0.95)),
    maxGap: round(gaps.at(-1) ?? 0),
    janky: gaps.filter((g) => g > 50).length,
    longtasks: lt.length,
    longtaskMs: round(lt.reduce((s, t) => s + t.duration, 0)),
    maxLongtask: round(Math.max(0, ...lt.map((t) => t.duration))),
    loafBlockingMs: round(lf.reduce((s, t) => s + t.blocking, 0)),
  };
}

const round = (n) => Math.round(n * 10) / 10;

async function oneRun(browser, run) {
  const host = await newPlayer(browser, "host");
  const frames = [];
  let startAt;
  host.page.on("websocket", (ws) => {
    if (!ws.url().endsWith("/ws")) return;
    ws.on("framereceived", (f) => {
      try {
        const msg = JSON.parse(f.payload);
        frames.push({ at: Date.now(), dir: "in", type: msg.type });
        if (msg.type === "race:countdown") startAt = msg.startAt;
      } catch {}
    });
    ws.on("framesent", (f) => {
      try {
        frames.push({
          at: Date.now(),
          dir: "out",
          type: JSON.parse(f.payload).type,
        });
      } catch {}
    });
  });
  const { page } = host;
  const cdp = await host.ctx.newCDPSession(page);
  if (THROTTLE > 1) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  }
  await page.goto(`${BASE}/race`);
  await byTestId(page, "mp-create").waitFor({ timeout: 60_000 });
  await byTestId(page, "mp-create").click();
  await byTestId(page, "mp-lobby").waitFor();
  await byTestId(page, "mp-mode-time").click();
  await byTestId(page, "mp-length-15").click();
  const code = (
    await byTestId(page, "mp-room-code").first().innerText()
  ).trim();

  const guests = [];
  const guestPages = [];
  for (let i = 1; i < PLAYERS; i++) {
    if (GUESTS === "browser") {
      const g = await newPlayer(browser, `guest${i}`);
      await g.page.goto(`${BASE}/r/${code}`);
      await byTestId(g.page, "mp-lobby").waitFor({ timeout: 60_000 });
      await byTestId(g.page, "mp-ready").click();
      guestPages.push(g);
    } else {
      guests.push(wsGuest(code, 70 + ((i * 37) % 60)));
    }
  }
  const allIn = await eventually(
    async () =>
      (await byTestId(page, "mp-player").count()) === PLAYERS &&
      (await byTestId(page, "mp-start").isEnabled()),
    20_000,
  );
  if (!allIn) throw new Error("room never filled / readied");
  if (SHOTS && run === 0) {
    await page.mouse.move(5, 895);
    await sleep(300);
    await page.screenshot({ path: `${SHOTS}/perf-${LABEL}-lobby.png` });
  }
  await byTestId(page, "mp-start").click();
  await eventually(() =>
    Promise.resolve(frames.some((f) => f.type === "race:countdown")),
  );
  const cd = frames.find((f) => f.type === "race:countdown");
  const profiling = PROFILE !== undefined && run === 0;
  if (profiling) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
    await browser.startTracing(page, {
      path: `${PROFILE}-trace.json`,
      categories: (
        process.env["TRACE_CATS"] ?? "devtools.timeline,blink.user_timing"
      ).split(","),
    });
  }
  const typeUntil = startAt + 14_000;
  await Promise.all([
    typeLoop(page, startAt, typeUntil, 80),
    ...guestPages.map((g, i) =>
      typeLoop(g.page, startAt, typeUntil, 90 + i * 10),
    ),
    (async () => {
      if (!SHOTS || run !== 0) return;
      await sleep(startAt - Date.now() + 3000);
      await page.screenshot({ path: `${SHOTS}/perf-${LABEL}-racing.png` });
    })(),
  ]);
  if (profiling) {
    const { profile } = await cdp.send("Profiler.stop");
    writeFileSync(`${PROFILE}.cpuprofile`, JSON.stringify(profile));
    await browser.stopTracing();
  }
  await byTestId(page, "mp-podium").waitFor({ timeout: 30_000 });
  const perf = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    ...window.__perf,
  }));
  for (const g of guests) g.close();
  await host.ctx.close();
  for (const g of guestPages) await g.ctx.close();

  // startAt is server time; same machine, so the same clock
  return { perf, frames, cdAt: cd.at, startAt };
}

const browser = await chromium.launch();
const runs = [];
try {
  for (let run = 0; run < RUNS; run++) {
    const r = await oneRun(browser, run);
    runs.push(r);
  }
} finally {
  await browser.close();
}

const summary = runs.map((r) => {
  const toPage = (epoch) => epoch - r.perf.origin;
  const { startAt } = r;
  const s = toPage(startAt);
  const windows = {
    countdown: [toPage(r.cdAt), s],
    go: [s, s + 1500],
    steady: [s + 2000, s + 8000],
  };
  const out = {};
  for (const [name, [from, to]] of Object.entries(windows)) {
    out[name] = windowStats(
      r.perf.frames,
      r.perf.longtasks,
      r.perf.loafs,
      from,
      to,
    );
  }
  const rate = (dir, from, to) => {
    const fs = r.frames.filter(
      (f) => f.dir === dir && f.at >= from && f.at < to,
    );
    const byType = {};
    for (const f of fs) byType[f.type] = (byType[f.type] ?? 0) + 1;
    const secs = (to - from) / 1000;
    return {
      perSec: round(fs.length / secs),
      byType: Object.fromEntries(
        Object.entries(byType).map(([k, v]) => [k, round(v / secs)]),
      ),
    };
  };
  out.wsIn = {
    go: rate("in", startAt, startAt + 1500),
    steady: rate("in", startAt + 2000, startAt + 8000),
  };
  out.wsOut = { steady: rate("out", startAt + 2000, startAt + 8000) };
  // where script time went per window (LoAF script attribution)
  out.hotScripts = {};
  for (const [name, [from, to]] of Object.entries(windows)) {
    const by = {};
    for (const l of r.perf.loafs) {
      if (l.start < from || l.start >= to) continue;
      for (const x of l.scripts) {
        const k = `${x.invoker} ${x.fn}@${x.src}`;
        by[k] ??= { ms: 0, forcedLayout: 0, n: 0 };
        by[k].ms += x.duration;
        by[k].forcedLayout += x.forcedLayout;
        by[k].n++;
      }
    }
    out.hotScripts[name] = Object.entries(by)
      .sort((a, b) => b[1].ms - a[1].ms)
      .slice(0, 6)
      .map(
        ([k, v]) =>
          `${round(v.ms)}ms x${v.n} ${k} (forced layout ${round(v.forcedLayout)})`,
      );
  }
  // the longest frames around the start, for attribution
  out.topLoafs = r.perf.loafs
    .filter((l) => l.start >= windows.countdown[0] && l.start < windows.go[1])
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5)
    .map((l) => ({
      atMs: round(l.start - s),
      duration: round(l.duration),
      styleAndLayout: round(l.styleAndLayout),
      scripts: l.scripts
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 4)
        .map(
          (x) =>
            `${round(x.duration)}ms ${x.invoker} ${x.fn}@${x.src} (forced layout ${round(x.forcedLayout)})`,
        ),
    }));
  return out;
});

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const median = {};
for (const w of ["countdown", "go", "steady"]) {
  median[w] = {};
  for (const k of Object.keys(summary[0][w])) {
    median[w][k] = med(summary.map((s) => s[w][k]));
  }
}
median.wsInPerSecGo = med(summary.map((s) => s.wsIn.go.perSec));
median.wsInPerSecSteady = med(summary.map((s) => s.wsIn.steady.perSec));
median.wsOutPerSecSteady = med(summary.map((s) => s.wsOut.steady.perSec));

const report = {
  label: LABEL,
  players: PLAYERS,
  guests: GUESTS,
  runs: RUNS,
  cpuThrottle: THROTTLE,
  median,
  summary,
};
console.log(JSON.stringify({ label: LABEL, median }, null, 2));
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2));
