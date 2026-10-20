import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// QM-009: tabs of one browser must send the same Quick Match clientId, even
// when a fresh profile clicks find match in two tabs at the same moment.
// Needs the WS server with FEATURE_QUICK_MATCH=1. Repeat with --repeat-each.
const FLAGS_ON = "?flags=characterSelect,opponentDogs,openRooms,quickMatch";
const SETTLE_MS = Number(process.env["SETTLE_MS"] ?? 8_000);
const CLIENT_ID_KEY = "puggie-mp-client-id";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// a loaded box can take minutes to boot a fresh context
test.describe.configure({ timeout: 300_000 });

const byTestId = (page: Page, id: string): Locator =>
  page.locator(`[data-testid="${id}"]`);

async function freshContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await skipNgrokWarning(ctx);
  return ctx;
}

type Tab = { page: Page; join: Promise<{ clientId: unknown; at: number }> };

/** a /race tab ready to find a match, with its first queue:join captured */
async function openTab(ctx: BrowserContext): Promise<Tab> {
  const page = await ctx.newPage();
  const join = new Promise<{ clientId: unknown; at: number }>((resolve) => {
    page.on("websocket", (ws) => {
      if (new URL(ws.url()).pathname !== "/ws") return;
      ws.on("framesent", (frame) => {
        try {
          const msg = JSON.parse(String(frame.payload)) as Record<
            string,
            unknown
          >;
          if (msg["type"] === "queue:join") {
            resolve({ clientId: msg["clientId"], at: Date.now() });
          }
        } catch {
          // not ours
        }
      });
    });
  });
  await page.goto(`/race${FLAGS_ON}`);
  // a real first visit: confirm the age gate by clicking, like a user (only
  // the first tab shows it)
  const gate = byTestId(page, "mp-age-confirm");
  await expect(gate.or(byTestId(page, "mp-public")).first()).toBeVisible({
    timeout: 180_000,
  });
  if (await gate.isVisible()) await gate.click();
  await expect(byTestId(page, "mp-public")).toBeVisible({ timeout: 180_000 });
  // let the tab sit like a user would: clicking right after load hides the
  // bug (the old code then passes); after a few seconds it fails 2/3
  await page.waitForTimeout(SETTLE_MS);
  return { page, join };
}

const storedId = async (page: Page): Promise<string | null> =>
  page.evaluate((key) => localStorage.getItem(key), CLIENT_ID_KEY);

test("fresh profile, two tabs click together: same clientId", async ({
  browser,
}) => {
  const ctx = await freshContext(browser);
  const [a, b] = [await openTab(ctx), await openTab(ctx)];
  expect(await storedId(a.page)).toBeNull();
  expect(await storedId(b.page)).toBeNull();

  const clickedAt = Date.now();
  await Promise.all([
    byTestId(a.page, "mp-public").click(),
    byTestId(b.page, "mp-public").click(),
  ]);
  const [ja, jb] = await Promise.all([a.join, b.join]);
  console.log(
    `QM-009 clientIds ${String(ja.clientId)} ${String(jb.clientId)}; click->join ${ja.at - clickedAt}/${jb.at - clickedAt} ms`,
  );

  expect(ja.clientId).toMatch(UUID_V4);
  expect(jb.clientId).toBe(ja.clientId);
  expect(await storedId(a.page)).toBe(ja.clientId);
  expect(await storedId(b.page)).toBe(ja.clientId);
  await ctx.close();
});

test("staggered tabs: the second tab reuses the first tab's id", async ({
  browser,
}) => {
  const ctx = await freshContext(browser);
  const a = await openTab(ctx);
  await byTestId(a.page, "mp-public").click();
  const ja = await a.join;
  const b = await openTab(ctx);
  await byTestId(b.page, "mp-public").click();
  const jb = await b.join;

  expect(ja.clientId).toMatch(UUID_V4);
  expect(jb.clientId).toBe(ja.clientId);
  await ctx.close();
});

test("an already stored id is sent unchanged by both tabs", async ({
  browser,
}) => {
  const stored = "0f0f0f0f-1234-4abc-8def-0123456789ab";
  const ctx = await freshContext(browser);
  // set once, before any page of this context runs
  await ctx.addInitScript(
    ([key, id]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, id);
    },
    [CLIENT_ID_KEY, stored] as const,
  );
  const [a, b] = [await openTab(ctx), await openTab(ctx)];
  const clickedAt = Date.now();
  await Promise.all([
    byTestId(a.page, "mp-public").click(),
    byTestId(b.page, "mp-public").click(),
  ]);
  const [ja, jb] = await Promise.all([a.join, b.join]);
  console.log(
    `QM-009 stored id click->join ${ja.at - clickedAt}/${jb.at - clickedAt} ms`,
  );
  expect(ja.clientId).toBe(stored);
  expect(jb.clientId).toBe(stored);
  await ctx.close();
});
