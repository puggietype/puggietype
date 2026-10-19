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

// Create room: Private / Open choice. Needs the WS server with
// FEATURE_OPEN_ROOMS=1.
const FLAGS_ON = "?flags=characterSelect,opponentDogs,openRooms";
const AGE_KEY = "puggie-mp-age-confirmed";
const PRIVATE_HINT = "Private: only people with the code can join";
const OPEN_HINT = "Open: anyone can see this room's code and join";

/** SCREENS_DIR, else e2e/screens (gitignored) */
const SCREENS = process.env["SCREENS_DIR"] ?? "e2e/screens";
mkdirSync(SCREENS, { recursive: true });

const byTestId = (page: Page | Locator, id: string): Locator =>
  page.locator(`[data-testid="${id}"]`);

async function playerContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await skipNgrokWarning(ctx);
  await ctx.addInitScript((key) => localStorage.setItem(key, "true"), AGE_KEY);
  return ctx;
}

/** a fresh context loads every module: slow against a cold dev server */
async function openRace(page: Page, query: string): Promise<void> {
  await page.goto(`/race${query}`);
  await expect(byTestId(page, "race-page")).toBeVisible({ timeout: 180_000 });
}

const privateRadio = (page: Page): Locator =>
  page.getByRole("radio", { name: "Private" });
const openRadio = (page: Page): Locator =>
  page.getByRole("radio", { name: "Open" });

async function expectPrivateDefault(page: Page): Promise<void> {
  await expect(privateRadio(page)).toBeChecked();
  await expect(openRadio(page)).not.toBeChecked();
}

const row = (page: Page, code: string): Locator =>
  page.locator(`[data-testid="mp-open-room"][data-code="${code}"]`);

test("Private is preselected on every visit to the hub", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ctx = await playerContext(browser);
  const page = await ctx.newPage();

  await openRace(page, FLAGS_ON);
  const create = byTestId(page, "mp-create");
  await expect(create).toHaveText(/Create room/);
  await expect(page.getByRole("group", { name: "who can join" })).toBeVisible();
  await expectPrivateDefault(page);
  await expect(privateRadio(page)).toHaveAccessibleDescription(PRIVATE_HINT);
  await expect(openRadio(page)).toHaveAccessibleDescription(OPEN_HINT);
  await expect(byTestId(page, "mp-create-hint-private")).toBeVisible();
  await expect(byTestId(page, "mp-create-hint-open")).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/create-room-default.png` });

  // keyboard: arrow from Private selects Open
  await privateRadio(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect(openRadio(page)).toBeChecked();
  await expect(openRadio(page)).toBeFocused();
  await page.screenshot({ path: `${SCREENS}/create-room-open-selected.png` });

  // leave and come back: Private again
  await page.goto("/");
  await page.goBack();
  await expect(byTestId(page, "race-page")).toBeVisible({ timeout: 60_000 });
  await expectPrivateDefault(page);

  // reload: Private again
  await openRadio(page).check();
  await page.reload();
  await expect(byTestId(page, "race-page")).toBeVisible({ timeout: 60_000 });
  await expectPrivateDefault(page);

  // a fresh load in the same context: nothing remembered
  await openRadio(page).check();
  await openRace(page, FLAGS_ON);
  await expectPrivateDefault(page);

  await ctx.close();
});

test("create Open: listed for others right away; host can unlist", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const ctxA = await playerContext(browser);
  const ctxB = await playerContext(browser);
  const host = await ctxA.newPage();
  const watcher = await ctxB.newPage();

  await openRace(watcher, FLAGS_ON);
  await expect(byTestId(watcher, "mp-open-rooms-status")).toBeVisible();

  await openRace(host, FLAGS_ON);
  await openRadio(host).check();
  await byTestId(host, "mp-create").click();
  await expect(byTestId(host, "mp-lobby")).toBeVisible();
  const code = (await byTestId(host, "mp-room-code").innerText()).trim();

  // listed without touching the in-lobby toggle
  const toggle = byTestId(host, "mp-open-toggle");
  await expect(toggle).toBeChecked();
  await expect(row(watcher, code)).toBeVisible();
  await expect(byTestId(row(watcher, code), "mp-open-room-humans")).toHaveText(
    /1\/8/,
  );
  await watcher.screenshot({ path: `${SCREENS}/create-room-lobby-listed.png` });

  // the in-lobby toggle still switches it back
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(row(watcher, code)).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});

test("create Private (default): not listed", async ({ browser }) => {
  test.setTimeout(600_000);
  const ctxA = await playerContext(browser);
  const ctxB = await playerContext(browser);
  const host = await ctxA.newPage();
  const watcher = await ctxB.newPage();

  await openRace(watcher, FLAGS_ON);
  await expect(byTestId(watcher, "mp-open-rooms-status")).toBeVisible();

  await openRace(host, FLAGS_ON);
  await expectPrivateDefault(host);
  await byTestId(host, "mp-create").click();
  await expect(byTestId(host, "mp-lobby")).toBeVisible();
  const code = (await byTestId(host, "mp-room-code").innerText()).trim();
  await expect(byTestId(host, "mp-open-toggle")).not.toBeChecked();

  // give a would-be listing time to arrive
  await watcher.waitForTimeout(1500);
  await expect(row(watcher, code)).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});

test("open rooms off: no choice, creates a private lobby", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ctx = await playerContext(browser);
  const page = await ctx.newPage();

  await openRace(page, "?flags=characterSelect,opponentDogs");
  await expect(byTestId(page, "mp-create")).toHaveText(/Create room/);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await byTestId(page, "mp-create").click();
  await expect(byTestId(page, "mp-lobby")).toBeVisible();
  await expect(byTestId(page, "mp-open-toggle")).toHaveCount(0);

  await ctx.close();
});
