import { mkdirSync } from "node:fs";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// Quick Match, bots and reports. Needs the WS server with
// FEATURE_QUICK_MATCH=1 FEATURE_REPORT=1; both client flags are off by
// default, so these tabs turn them on with ?flags=.
const FLAGS_ON =
  "?flags=characterSelect,opponentDogs,openRooms,quickMatch,report";
const FLAGS_OFF = "?flags=characterSelect,opponentDogs,openRooms";
const AGE_KEY = "puggie-mp-age-confirmed";

/** SCREENS_DIR, else e2e/screens (gitignored) */
const SCREENS = process.env["SCREENS_DIR"] ?? "e2e/screens";
mkdirSync(SCREENS, { recursive: true });

const byTestId = (page: Page | Locator, id: string): Locator =>
  page.locator(`[data-testid="${id}"]`);

async function playerContext(
  browser: Browser,
  opts: { ageConfirmed?: boolean } = {},
): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await skipNgrokWarning(ctx);
  if (opts.ageConfirmed !== false) {
    await ctx.addInitScript(
      (key) => localStorage.setItem(key, "true"),
      AGE_KEY,
    );
  }
  return ctx;
}

/** a fresh context loads every module: slow against a cold dev server */
async function openRace(page: Page, query: string): Promise<void> {
  await page.goto(`/race${query}`);
  await expect(byTestId(page, "race-page")).toBeVisible({ timeout: 180_000 });
}

/** every client -> server message the page sends over /ws */
function sentMessages(page: Page): Record<string, unknown>[] {
  const msgs: Record<string, unknown>[] = [];
  page.on("websocket", (ws) => {
    if (new URL(ws.url()).pathname !== "/ws") return;
    ws.on("framesent", (frame) => {
      try {
        const msg = JSON.parse(String(frame.payload)) as Record<
          string,
          unknown
        >;
        if (typeof msg["type"] === "string") msgs.push(msg);
      } catch {
        // not ours
      }
    });
  });
  return msgs;
}

const types = (msgs: Record<string, unknown>[]): unknown[] =>
  msgs.map((m) => m["type"]);

test("age gate first, queue screen, cancel", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await playerContext(browser, { ageConfirmed: false });
  const page = await ctx.newPage();
  const sent = sentMessages(page);

  await openRace(page, FLAGS_ON);
  await expect(byTestId(page, "mp-age-gate")).toBeVisible();
  await expect(byTestId(page, "mp-public")).toHaveCount(0);
  expect(sent).toEqual([]);
  await byTestId(page, "mp-age-confirm").click();

  await expect(byTestId(page, "mp-quick-match")).toBeVisible();
  await expect(byTestId(page, "mp-public-soon")).toHaveCount(0);
  await byTestId(page, "mp-public").click();

  await expect(byTestId(page, "mp-queue")).toBeVisible();
  await expect(byTestId(page, "mp-queue-band")).toContainText("wpm");
  await expect(byTestId(page, "mp-queue-elapsed")).toHaveText(/0:0[1-9]/);
  await page.screenshot({ path: `${SCREENS}/quickmatch-queue.png` });
  // no local time 30 english results yet: the default pace of 50
  const join = sent.find((m) => m["type"] === "queue:join");
  expect(join).toEqual({ type: "queue:join", claimedWpm: 50 });

  await byTestId(page, "mp-queue-cancel").click();
  await expect(byTestId(page, "mp-queue")).toHaveCount(0);
  await expect(byTestId(page, "mp-public")).toBeVisible();
  expect(types(sent)).toContain("queue:leave");

  await ctx.close();
});

test("bots fill a lone match, labelled, never reportable", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const ctx = await playerContext(browser);
  const page = await ctx.newPage();
  const sent = sentMessages(page);

  await openRace(page, FLAGS_ON);
  await byTestId(page, "mp-public").click();
  await expect(byTestId(page, "mp-queue")).toBeVisible();

  // bot fill kicks in after ~15 s, then straight to the countdown
  await expect(page.locator("#words")).toBeVisible({ timeout: 60_000 });
  await expect(byTestId(page, "mp-bot-label").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.screenshot({ path: `${SCREENS}/quickmatch-race.png` });

  // time 30: results after the race
  await expect(byTestId(page, "mp-podium")).toBeVisible({ timeout: 90_000 });
  const botRow = page
    .locator('[data-testid="mp-result-row"]')
    .filter({ has: byTestId(page, "mp-bot-label") })
    .first();
  await expect(botRow).toContainText("Bot");
  await expect(byTestId(botRow, "mp-report")).toHaveCount(0);
  await page.screenshot({ path: `${SCREENS}/quickmatch-podium-bots.png` });
  expect(types(sent)).not.toContain("report:player");

  await ctx.close();
});

test("two humans match and one reports the other", async ({ browser }) => {
  test.setTimeout(600_000);
  const ctxA = await playerContext(browser);
  const ctxB = await playerContext(browser);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const aSent = sentMessages(a);

  await openRace(a, FLAGS_ON);
  await openRace(b, FLAGS_ON);
  await byTestId(a, "mp-public").click();
  await byTestId(b, "mp-public").click();

  await expect(byTestId(a, "mp-podium")).toBeVisible({ timeout: 180_000 });
  await expect(byTestId(b, "mp-podium")).toBeVisible({ timeout: 60_000 });

  // no report button on our own row
  const ownRow = a
    .locator('[data-testid="mp-result-row"]')
    .filter({ hasText: "(you)" });
  await expect(byTestId(ownRow, "mp-report")).toHaveCount(0);

  const other = a
    .locator('[data-testid="mp-result-row"]')
    .filter({ hasNotText: "(you)" })
    .filter({ hasNot: byTestId(a, "mp-bot-label") })
    .first();
  await byTestId(other, "mp-report").click();
  const menu = byTestId(other, "mp-report-menu");
  await expect(menu).toBeVisible();
  await expect(byTestId(menu, "mp-report-reason")).toHaveCount(4);
  await expect(menu.locator("input, textarea")).toHaveCount(0);
  await a.screenshot({ path: `${SCREENS}/quickmatch-report-menu.png` });

  await menu.locator('[data-reason="cheating"]').click();
  await expect(byTestId(other, "mp-report-thanks")).toHaveText(
    "thanks, report received",
  );
  await expect(a.locator("body")).not.toContainText(/anonymous/i);
  await a.screenshot({ path: `${SCREENS}/quickmatch-report-thanks.png` });
  const report = aSent.find((m) => m["type"] === "report:player");
  expect(Object.keys(report ?? {}).sort()).toEqual([
    "playerId",
    "reason",
    "type",
  ]);

  await ctxA.close();
  await ctxB.close();
});

test("flags off: coming soon, no queue or report messages", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ctx = await playerContext(browser);
  const page = await ctx.newPage();
  const sent = sentMessages(page);

  await openRace(page, FLAGS_OFF);
  await expect(byTestId(page, "mp-public-soon")).toHaveText("coming soon");
  await expect(byTestId(page, "mp-public")).toBeDisabled();
  await expect(byTestId(page, "mp-quick-match")).toHaveCount(0);
  await page.screenshot({ path: `${SCREENS}/quickmatch-flag-off.png` });

  await byTestId(page, "mp-create").click();
  await expect(byTestId(page, "mp-lobby")).toBeVisible();
  await expect(byTestId(page, "mp-report")).toHaveCount(0);
  expect(
    types(sent).filter(
      (t) => String(t).startsWith("queue:") || t === "report:player",
    ),
  ).toEqual([]);

  await ctx.close();
});
