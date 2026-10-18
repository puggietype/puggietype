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

// Open rooms. Needs the WS server with FEATURE_OPEN_ROOMS=1; the client flag
// is off by default, so these tabs turn it on with ?flags=.
const FLAGS_ON = "?flags=characterSelect,opponentDogs,openRooms";
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

/** every client -> server message type the page sends over /ws */
function sentTypes(page: Page): string[] {
  const types: string[] = [];
  page.on("websocket", (ws) => {
    if (new URL(ws.url()).pathname !== "/ws") return;
    ws.on("framesent", (frame) => {
      try {
        const msg = JSON.parse(String(frame.payload)) as { type?: unknown };
        if (typeof msg.type === "string") types.push(msg.type);
      } catch {
        // not ours
      }
    });
  });
  return types;
}

test("host opens a lobby, strangers see it without nicknames, join, it closes", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const ctxA = await playerContext(browser);
  const ctxB = await playerContext(browser);
  const ctxC = await playerContext(browser, { ageConfirmed: false });
  const host = await ctxA.newPage();
  const joiner = await ctxB.newPage();
  const watcher = await ctxC.newPage();
  const watcherSent = sentTypes(watcher);
  const joinerSent = sentTypes(joiner);

  // the age gate comes before any list (and any socket)
  await openRace(watcher, FLAGS_ON);
  await expect(byTestId(watcher, "mp-age-gate")).toBeVisible();
  await expect(byTestId(watcher, "mp-open-rooms")).toHaveCount(0);
  expect(watcherSent).toEqual([]);
  await byTestId(watcher, "mp-age-confirm").click();
  await expect(byTestId(watcher, "mp-open-rooms-status")).toBeVisible();
  expect(watcherSent).toContain("rooms:list");

  await openRace(joiner, FLAGS_ON);
  await expect(byTestId(joiner, "mp-open-rooms-status")).toBeVisible();

  // a new lobby starts private and unlisted
  await openRace(host, FLAGS_ON);
  await byTestId(host, "mp-create").click();
  const code = (await byTestId(host, "mp-room-code").innerText()).trim();
  const hostName = (await byTestId(host, "mp-my-name").innerText()).trim();
  const toggle = byTestId(host, "mp-open-toggle");
  await expect(toggle).not.toBeChecked();
  const row = (page: Page): Locator =>
    page.locator(`[data-testid="mp-open-room"][data-code="${code}"]`);
  await expect(row(joiner)).toHaveCount(0);

  // host lists it
  await toggle.click();
  await expect(toggle).toBeChecked();
  await host.screenshot({ path: `${SCREENS}/openrooms-lobby-toggle.png` });

  await expect(row(joiner)).toBeVisible();
  await expect(byTestId(row(joiner), "mp-open-room-humans")).toHaveText(/1\/8/);
  await expect(byTestId(row(joiner), "mp-open-room-bots")).toHaveCount(0);
  await expect(byTestId(row(joiner), "mp-open-room-phase")).toHaveText("lobby");
  await expect(byTestId(joiner, "mp-open-rooms")).not.toContainText(hostName);
  await joiner.screenshot({ path: `${SCREENS}/openrooms-list.png` });

  // joining from the list: the watcher sees the count go up
  await expect(byTestId(row(watcher), "mp-open-room-humans")).toHaveText(
    /1\/8/,
  );
  await byTestId(row(joiner), "mp-open-room-join").click();
  await expect(byTestId(joiner, "mp-lobby")).toBeVisible();
  await expect(byTestId(joiner, "mp-room-code")).toHaveText(code);
  await expect(byTestId(host, "mp-player")).toHaveCount(2);
  await expect(byTestId(row(watcher), "mp-open-room-humans")).toHaveText(
    /2\/8/,
  );
  await expect(byTestId(watcher, "mp-open-rooms")).not.toContainText(hostName);

  // non-hosts get a badge, not the toggle
  await expect(byTestId(joiner, "mp-open-badge")).toHaveText("open");
  await expect(byTestId(joiner, "mp-open-toggle")).toHaveCount(0);

  // the joiner's hub stopped listening once they were in the lobby
  await expect.poll(() => joinerSent).toContain("rooms:unsubscribe");

  // host unlists: it drops off the list, the badge flips
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(row(watcher)).toHaveCount(0);
  await expect(byTestId(joiner, "mp-open-badge")).toHaveText("private");

  await ctxA.close();
  await ctxB.close();
  await ctxC.close();
});

test("flag off: coming soon and no open rooms list", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await playerContext(browser);
  const page = await ctx.newPage();
  const sent = sentTypes(page);

  await openRace(page, "?flags=characterSelect,opponentDogs");
  await expect(byTestId(page, "mp-create")).toBeVisible();
  await expect(byTestId(page, "mp-public-soon")).toHaveText("coming soon");
  await expect(byTestId(page, "mp-open-rooms")).toHaveCount(0);
  // give a would-be subscription time to go out
  await page.waitForTimeout(1500);
  expect(sent.filter((t) => t.startsWith("rooms:"))).toEqual([]);
  await page.screenshot({ path: `${SCREENS}/openrooms-flag-off.png` });

  // a lobby has no open toggle or badge either
  await byTestId(page, "mp-create").click();
  await expect(byTestId(page, "mp-lobby")).toBeVisible();
  await expect(byTestId(page, "mp-open-toggle")).toHaveCount(0);
  await expect(byTestId(page, "mp-open-badge")).toHaveCount(0);
  expect(
    sent.filter((t) => t.startsWith("rooms:") || t === "room:setOpen"),
  ).toEqual([]);

  await ctx.close();
});
