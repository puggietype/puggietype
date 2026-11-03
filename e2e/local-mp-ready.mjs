// Local-only manual check of the ready flow (private and open rooms): lobby
// Ready / badges / "N/M ready", then the results screen's "Ready for next
// race" / "Back to lobby" with a guest sitting the next race out. Starts
// nothing itself: run a local puggietype-server and a frontend dev server
// pointing at it first (see e2e/local-mp-mode-switch.mjs), e.g.
//
//   cd ../puggietype-server
//   PORT=2601 COUNTDOWN_MS=1000 FEATURE_OPEN_ROOMS=1 node_modules/.bin/tsx src/index.ts
//   cd frontend
//   PUGGIE_WS_PROXY_TARGET=ws://localhost:2601 SERVER_OPEN=false \
//     node_modules/.bin/vite dev --port 3401
//   BASE_URL=http://localhost:3401 SHOTS_DIR=/tmp/shots node e2e/local-mp-ready.mjs
//
// OPEN=1 runs it in an open lobby joined from the list (default: private, by
// code). Version-aware: it reads which results flow the server speaks from
// the podium (mp-next-race = ready from results, mp-rematch /
// mp-waiting-host = the older rematch flow). On an older server it checks
// the rematch fallback and skips the ready-from-results checks instead of
// aborting; SERVER_FLOW=results|rematch pins the expected flow and fails if
// the server disagrees. Screenshots go to SHOTS_DIR as ready-*.png. Refuses non-local
// BASE_URLs; exits non-zero on the first failed check.
import { mkdirSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env["BASE_URL"] ?? "http://localhost:3401";
const { hostname } = new URL(BASE);
if (!["localhost", "127.0.0.1"].includes(hostname)) {
  console.error(`refusing non-local BASE_URL ${BASE}`);
  process.exit(2);
}
const HEADED = process.env["HEADED"] === "1";
const OPEN = process.env["OPEN"] === "1";
const SHOTS = process.env["SHOTS_DIR"];
const PINNED_FLOW = process.env["SERVER_FLOW"];
if (
  PINNED_FLOW !== undefined &&
  !["results", "rematch"].includes(PINNED_FLOW)
) {
  console.error(`SERVER_FLOW must be results or rematch, got ${PINNED_FLOW}`);
  process.exit(2);
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const byTestId = (page, id) => page.locator(`[data-testid="${id}"]`);
let failures = 0;

function check(ok, what) {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
}

async function shot(page, name) {
  if (!SHOTS) return;
  // off the buttons: a hover colour isn't the state we want to show
  await page.mouse.move(5, 895);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/ready-${name}.png` });
}

/** settle on a condition, false on timeout */
async function eventually(fn, timeout = 5_000) {
  const until = Date.now() + timeout;
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() > until) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const text = (page, id) => byTestId(page, id).first().innerText();
const attr = (page, id, name) => byTestId(page, id).first().getAttribute(name);

/** multiplayer has no restart: no "tab + enter - restart test" tip (MS-01) */
async function checkNoRestartTip(page, where) {
  check(
    (await byTestId(page, "keytip-restart").count()) === 0 &&
      !(await page.locator("footer").innerText()).includes("restart test"),
    `${where}: no restart test keytip`,
  );
}

/**
 * which results flow the server speaks, read off the podium once it's up:
 * "results" (ready from the results screen) or "rematch" (older servers)
 */
async function detectFlow(host, guest) {
  let flow;
  await eventually(async () => {
    if ((await byTestId(guest, "mp-next-race").count()) > 0) flow = "results";
    else if (
      (await byTestId(host, "mp-rematch").count()) > 0 ||
      (await byTestId(guest, "mp-waiting-host").count()) > 0
    )
      flow = "rematch";
    return flow !== undefined;
  });
  return flow;
}

async function typeAll(page, delay = 70) {
  await byTestId(page, "mp-race").waitFor();
  await byTestId(page, "mp-countdown").waitFor({ state: "hidden" });
  const n = await page.locator("#words .word").count();
  for (let i = 0; i < n; i++) {
    const letters = await page
      .locator("#words .word.active letter")
      .allTextContents();
    if (letters.length === 0) return;
    await page.keyboard.type(`${letters.join("")} `, { delay });
  }
}

/** mid-race rules: no restart control, carets without name labels */
async function checkRaceRules(page, who) {
  await byTestId(page, "mp-race").waitFor();
  check(
    (await page.locator('[data-ui-element="restartTestButton"]').count()) === 0,
    `${who}: no restart button in the race`,
  );
  const carets = byTestId(page, "mp-opponent-caret");
  const labels = await carets.evaluateAll((els) =>
    els.map((el) => el.textContent?.trim() ?? ""),
  );
  check(
    labels.every((t) => t === ""),
    `${who}: opponent carets carry no name labels (${labels.length})`,
  );
}

const browser = await chromium.launch({ headless: !HEADED });
try {
  const pages = {};
  for (const who of ["host", "alice", "bob"]) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctx.addInitScript(() =>
      localStorage.setItem("puggie-mp-age-confirmed", "true"),
    );
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`${who} pageerror: ${e.message}`));
    pages[who] = page;
  }
  const { host, alice, bob } = pages;

  await host.goto(`${BASE}/race`);
  await byTestId(host, "mp-create").waitFor({ timeout: 60_000 });
  if (OPEN) await byTestId(host, "mp-create-open").click();
  await byTestId(host, "mp-create").click();
  await byTestId(host, "mp-lobby").waitFor();
  await byTestId(host, "mp-mode-words").click();
  await byTestId(host, "mp-length-10").click();
  const code = (await text(host, "mp-room-code")).trim();
  for (const guest of [alice, bob]) {
    if (OPEN) {
      await guest.goto(`${BASE}/race`);
      await byTestId(guest, "mp-open-room-join")
        .first()
        .click({ timeout: 60_000 });
    } else {
      await guest.goto(`${BASE}/r/${code}`);
    }
    await byTestId(guest, "mp-lobby").waitFor({ timeout: 60_000 });
  }
  await eventually(
    async () => (await byTestId(host, "mp-player").count()) === 3,
  );

  // ---- lobby
  await checkNoRestartTip(host, "lobby /race (host)");
  await checkNoRestartTip(
    alice,
    OPEN ? "lobby /race (guest)" : "lobby /r/* (guest)",
  );
  check(
    (await text(alice, "mp-ready")).trim() === "Ready",
    "lobby: guest sees a big Ready",
  );
  check(
    (await attr(alice, "mp-ready", "aria-pressed")) === "false",
    "lobby: Ready is a toggle, aria-pressed=false",
  );
  check(
    (await attr(host, "mp-ready-count", "aria-live")) === "polite",
    "lobby: N/M ready count is aria-live=polite",
  );
  check(
    (await byTestId(alice, "mp-ready-badge").allInnerTexts()).every((t) =>
      t.includes("waiting"),
    ),
    "lobby: every guest badge says waiting",
  );
  await shot(alice, "lobby-not-ready");
  await byTestId(alice, "mp-ready").click();
  check(
    await eventually(async () =>
      (await text(alice, "mp-ready")).includes("Ready ✓"),
    ),
    "lobby: Ready toggles to Ready ✓",
  );
  check(
    (await attr(alice, "mp-ready", "aria-pressed")) === "true",
    "lobby: aria-pressed=true once ready",
  );
  await shot(alice, "lobby-ready");
  check(
    await eventually(
      async () => (await text(host, "mp-ready-count")) === "1/2 ready",
    ),
    "lobby: host sees 1/2 ready",
  );
  check(await byTestId(host, "mp-start").isDisabled(), "lobby: start waits");
  await shot(host, "lobby-n-of-m");
  await byTestId(bob, "mp-ready").click();
  check(
    await eventually(
      async () => (await text(host, "mp-ready-count")) === "2/2 ready",
    ),
    "lobby: host sees 2/2 ready",
  );
  await shot(host, "lobby-all-ready");

  // ---- race 1: everyone
  await byTestId(host, "mp-start").click();
  await Promise.all([
    checkRaceRules(host, "host"),
    checkRaceRules(alice, "alice"),
  ]);
  await shot(host, "race-no-restart-no-labels");
  await Promise.all([typeAll(host), typeAll(alice), typeAll(bob, 110)]);
  for (const page of [host, alice, bob]) {
    await byTestId(page, "mp-podium").waitFor({ timeout: 30_000 });
  }

  // ---- results: which flow does this server speak?
  await checkNoRestartTip(host, "results (host)");
  const flow = await detectFlow(host, alice);
  console.log(`info server results flow: ${flow ?? "unknown"}`);
  check(flow !== undefined, "results: server flow detected");
  if (PINNED_FLOW !== undefined) {
    check(flow === PINNED_FLOW, `results: server flow is ${PINNED_FLOW}`);
  }
  if (flow !== "results") {
    if (flow === "rematch") {
      check(
        (await byTestId(host, "mp-rematch").count()) === 1,
        "rematch flow: host sees rematch",
      );
      check(
        (await text(alice, "mp-waiting-host")).includes(
          "waiting for the host to start a rematch",
        ),
        "rematch flow: guest waits for the host",
      );
      check(
        (await byTestId(alice, "mp-ready").count()) === 0,
        "rematch flow: no Ready on the results screen",
      );
      await shot(host, "results-rematch-flow");
      console.log("skip ready-from-results checks (older server)");
    }
    await browser.close();
    console.log(failures === 0 ? "all checks passed" : `${failures} failed`);
    process.exit(failures === 0 ? 0 : 1);
  }
  check(
    (await text(alice, "mp-ready")).includes("Ready for next race"),
    "results: guest sees Ready for next race",
  );
  check(
    (await byTestId(host, "mp-rematch").count()) === 0,
    "results: no legacy rematch in a private/open room",
  );
  await shot(alice, "results-buttons");
  await shot(host, "results-host");
  await byTestId(alice, "mp-ready").click();
  check(
    await eventually(
      async () => (await text(host, "mp-ready-count")) === "1/2 ready",
    ),
    "results: host sees 1/2 ready",
  );
  check(
    await byTestId(host, "mp-start-next").isDisabled(),
    "results: start next race waits for bob",
  );
  check(
    await eventually(async () =>
      (await text(alice, "mp-ready")).includes("Ready ✓"),
    ),
    "results: guest's button turns to Ready ✓",
  );
  await shot(alice, "results-ready");
  await shot(host, "results-n-of-m");

  // bob goes back to the lobby: no longer blocks, and isn't dragged in
  await byTestId(bob, "mp-back-to-lobby").click();
  await byTestId(bob, "mp-lobby").waitFor();
  check(
    (await text(bob, "mp-sitting-out")).includes("results screen"),
    "results: bob's lobby says the others are on results",
  );
  await shot(bob, "results-back-to-lobby");
  check(
    await eventually(
      async () => (await text(host, "mp-ready-count")) === "1/1 ready",
    ),
    "results: host sees 1/1 ready once bob left for the lobby",
  );
  check(
    await eventually(async () => byTestId(host, "mp-start-next").isEnabled()),
    "results: start next race enabled",
  );
  await shot(host, "results-can-start");

  // ---- race 2: host + alice only
  await byTestId(host, "mp-start-next").click();
  await byTestId(alice, "mp-race").waitFor({ timeout: 10_000 });
  check(
    await eventually(async () =>
      (await text(bob, "mp-sitting-out")).includes("race is running"),
    ),
    "race 2: bob stays in the lobby while the race runs",
  );
  check(
    await byTestId(bob, "mp-ready").isDisabled(),
    "race 2: bob can't ready mid-race",
  );
  check(
    (await byTestId(bob, "mp-race").count()) === 0,
    "race 2: bob not racing",
  );
  await shot(bob, "sitting-out");
  await Promise.all([typeAll(host), typeAll(alice)]);
  await byTestId(host, "mp-podium").waitFor({ timeout: 30_000 });
  const rows = await byTestId(host, "mp-result-row").count();
  check(rows === 2, `race 2: results only list the racers (${rows})`);
  check(
    (await byTestId(bob, "mp-lobby").count()) === 1,
    "race 2: bob still on the lobby screen at results",
  );
  await shot(host, "results-after-sitout");

  // bob readies from the lobby and makes the next race
  await byTestId(bob, "mp-ready").click();
  await byTestId(alice, "mp-ready").click();
  check(
    await eventually(
      async () => (await text(host, "mp-ready-count")) === "2/2 ready",
    ),
    "results: bob readied from the lobby counts",
  );
  await byTestId(host, "mp-start-next").click();
  check(
    await eventually(
      async () => (await byTestId(bob, "mp-race").count()) === 1,
      10_000,
    ),
    "race 3: bob is in after readying",
  );
} finally {
  await browser.close();
}
console.log(failures === 0 ? "all checks passed" : `${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
