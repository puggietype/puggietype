import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Production build of the full app with the real GA4 id, served by
 * `wrangler pages dev`. Nothing reaches Google: gtag/js is answered with a
 * local fake that records dataLayer calls and beacons a fake collect per
 * event, and every other Google host is answered locally too. Skips when the
 * served build does not carry the production id.
 */
const ID = "G-B8GK1C9T6T";
const GTAG_URL = `https://www.googletagmanager.com/gtag/js?id=${ID}`;
const GOOGLE_HOST =
  /(?:^|\.)(?:google|googleapis|gstatic|google-analytics|googletagmanager|googletagservices|doubleclick|googlesyndication|googleadservices)\.[a-z.]+$/i;
const ADS_URL = /doubleclick|googlesyndication|googleadservices|adservice/i;

/**
 * Stands in for gtag.js. Sets `_ga` cookies and beacons a fake collect per
 * event, with `dl` from the event's page_location (never the browser URL).
 */
const FAKE_GTAG = `(function () {
  var w = window;
  w.__fakeGtagLoads = (w.__fakeGtagLoads || 0) + 1;
  var id = new URL(document.currentScript.src).searchParams.get("id");
  document.cookie = "_ga=GA1.1.1.1; path=/; max-age=3600";
  document.cookie = "_ga_" + id.slice(2) + "=GS1.1.1; path=/; max-age=3600";
  function handle(args) {
    if (!args || args[0] !== "event") return;
    var params = args[2];
    var loc = params && typeof params.page_location === "string"
      ? "&dl=" + encodeURIComponent(params.page_location)
      : "";
    navigator.sendBeacon(
      "https://www.google-analytics.com/g/collect?v=2&tid=" + id + "&en=" +
        encodeURIComponent(String(args[1])) + loc,
    );
  }
  var dl = (w.dataLayer = w.dataLayer || []);
  for (var i = 0; i < dl.length; i++) handle(dl[i]);
  var push = dl.push;
  dl.push = function () {
    for (var j = 0; j < arguments.length; j++) handle(arguments[j]);
    return push.apply(dl, arguments);
  };
})();`;

type Entry = [string, ...unknown[]];

let carriesId = false;

test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  // same default as playwright.config.ts
  const base = process.env["BASE_URL"] ?? "http://localhost:3000";
  try {
    const html = await (await fetch(new URL("/", base))).text();
    const scripts = [...html.matchAll(/(?:src|href)="(\/js\/[^"]+\.js)"/g)].map(
      (match) => match[1] ?? "",
    );
    for (const src of scripts) {
      const body = await (await fetch(new URL(src, base))).text();
      if (body.includes(ID)) {
        carriesId = true;
        break;
      }
    }
  } catch {
    carriesId = false;
  }
});

test.beforeEach(() => {
  test.skip(
    !carriesId,
    `served build does not carry ${ID}; build with GA4_MEASUREMENT_ID=${ID}`,
  );
});

/** Answers every Google host locally and records each URL. */
async function fenceGoogle(context: BrowserContext): Promise<string[]> {
  const seen: string[] = [];
  await context.route(
    (url) => GOOGLE_HOST.test(url.hostname),
    async (route) => {
      const url = route.request().url();
      seen.push(url);
      const parsed = new URL(url);
      if (
        parsed.hostname === "www.googletagmanager.com" &&
        parsed.pathname === "/gtag/js"
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: FAKE_GTAG,
        });
        return;
      }
      await route.fulfill({ status: 204, body: "" });
    },
  );
  return seen;
}

async function dataLayer(page: Page): Promise<Entry[]> {
  return page.evaluate(() => {
    const dl = (window as unknown as { dataLayer?: ArrayLike<unknown>[] })
      .dataLayer;
    // gtag queues Arguments objects; copy them to arrays to serialize
    return (dl ?? []).map((entry) => Array.from(entry)) as Entry[];
  });
}

async function windowValue(page: Page, key: string): Promise<unknown> {
  return page.evaluate((name): unknown => Reflect.get(window, name), key);
}

function pageViews(entries: Entry[]): number {
  return entries.filter(
    (entry) => entry[0] === "event" && entry[1] === "page_view",
  ).length;
}

async function gtmScripts(page: Page): Promise<number> {
  return page.locator("script[src*='googletagmanager']").count();
}

async function gaCookies(context: BrowserContext): Promise<string[]> {
  return (await context.cookies())
    .map((cookie) => cookie.name)
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
}

async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
}

async function seedAnalyticsAccept(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "acceptedCookies",
      JSON.stringify({
        security: true,
        analytics: true,
        doNotSellOrShare: false,
      }),
    );
  });
}

test("no Google request before a choice or after Reject", async ({
  page,
  context,
}) => {
  const google = await fenceGoogle(context);

  await openHome(page);
  await expect(page.locator("#consent-accept")).toBeVisible();
  await page.waitForTimeout(1000);
  expect(google).toEqual([]);
  expect(await gtmScripts(page)).toBe(0);
  await page.locator("#consent-reject").click();
  await expect(page.locator("#CookiesModal")).toBeHidden();
  await page.reload();
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  expect(google).toEqual([]);
  expect(await gtmScripts(page)).toBe(0);

  await page.evaluate(() => localStorage.clear());
  await page.goto("/privacy");
  const banner = page.locator("#pt-consent-banner");
  await expect(banner).toBeVisible();
  await page.waitForTimeout(1000);
  expect(google).toEqual([]);
  expect(await gtmScripts(page)).toBe(0);
  await banner.locator(".consentActions button").nth(1).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.locator("h1")).toContainText(/privacy/i);
  await page.waitForTimeout(1000);
  expect(google).toEqual([]);
  expect(await gtmScripts(page)).toBe(0);
});

test("Accept loads only our tag with ads denied and signals off", async ({
  page,
  context,
}) => {
  const google = await fenceGoogle(context);

  await openHome(page);
  await page.locator("#consent-accept").waitFor();
  const before = await dataLayer(page);
  expect(JSON.stringify(before)).not.toContain('"analytics_storage":"granted"');
  await page.locator("#consent-accept").click();
  await expect.poll(async () => windowValue(page, "__fakeGtagLoads")).toBe(1);

  expect(google.filter((url) => url.includes("/gtag/"))).toEqual([GTAG_URL]);
  expect(google.filter((url) => ADS_URL.test(url))).toEqual([]);
  expect(await gtmScripts(page)).toBe(1);

  const entries = await dataLayer(page);
  const consent = entries.filter((entry) => entry[0] === "consent");
  const defaultAt = entries.findIndex(
    (entry) => entry[0] === "consent" && entry[1] === "default",
  );
  expect(entries[defaultAt]?.[2]).toMatchObject({
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
  const grantedAt = entries.findIndex(
    (entry) =>
      entry[0] === "consent" &&
      entry[1] === "update" &&
      (entry[2] as Record<string, unknown>)["analytics_storage"] === "granted",
  );
  expect(grantedAt).toBeGreaterThan(defaultAt);
  for (const entry of consent) {
    const state = entry[2] as Record<string, unknown>;
    for (const key of ["ad_storage", "ad_user_data", "ad_personalization"]) {
      expect([undefined, "denied"]).toContain(state[key]);
    }
  }
  expect(JSON.stringify(entries)).not.toMatch(/"ad_[a-z_]+":"granted"/);
  const config = entries.filter(
    (entry) => entry[0] === "config" && entry[1] === ID,
  );
  expect(config).toHaveLength(1);
  expect(config[0]?.[2]).toMatchObject({
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  expect(
    entries.filter((entry) => entry[0] === "config" && entry[1] !== ID),
  ).toEqual([]);
});

test("kids guide and kids-flow stay GA-free with a stored accept", async ({
  page,
  context,
}) => {
  const google = await fenceGoogle(context);
  await seedAnalyticsAccept(page);

  await page.goto("/guide/teaching-kids-to-type");
  await expect(page.locator("h1")).toBeVisible();
  await page.waitForLoadState("load");
  await page.waitForTimeout(1000);
  expect(await gtmScripts(page)).toBe(0);

  await page.locator("a.startTyping").click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  expect(
    await page.evaluate(() => sessionStorage.getItem("puggie-kids-flow")),
  ).toBe("1");
  expect(await gtmScripts(page)).toBe(0);
  expect(await dataLayer(page)).toEqual([]);
  expect(google).toEqual([]);
});

test("withdrawal through the footer stops GA for route changes and reloads", async ({
  page,
  context,
}) => {
  const google = await fenceGoogle(context);

  await openHome(page);
  await page.locator("#consent-accept").click();
  await expect
    .poll(async () => gaCookies(context))
    .toEqual(expect.arrayContaining(["_ga", "_ga_B8GK1C9T6T"]));
  await expect
    .poll(() => google.filter((url) => url.includes("/g/collect")).length)
    .toBeGreaterThan(0);

  // control: while accepted, a route change is a page_view
  const viewsBefore = pageViews(await dataLayer(page));
  await page.locator('[data-nav-item="settings"]').click();
  await page.waitForURL((url) => url.pathname === "/settings");
  await expect
    .poll(async () => pageViews(await dataLayer(page)))
    .toBe(viewsBefore + 1);

  await page.locator('[data-testid="privacy-cookie-settings"]').click();
  await page.locator("#consent-reject").click();
  await expect(page.locator("#CookiesModal")).toBeHidden();
  expect(await windowValue(page, `ga-disable-${ID}`)).toBe(true);
  expect(await gaCookies(context)).toEqual([]);

  const sent = google.length;
  const views = pageViews(await dataLayer(page));
  await page.locator('[data-nav-item="test"]').click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  expect(google.slice(sent)).toEqual([]);
  expect(pageViews(await dataLayer(page))).toBe(views);
  expect(await gaCookies(context)).toEqual([]);

  await page.reload();
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  expect(google.slice(sent)).toEqual([]);
  expect(await gtmScripts(page)).toBe(0);
  expect(pageViews(await dataLayer(page))).toBe(0);
  expect(await gaCookies(context)).toEqual([]);
});

test("landing UTM tags reach collect dl in order, tokens and hash do not", async ({
  page,
  context,
}) => {
  const google = await fenceGoogle(context);
  await seedAnalyticsAccept(page);

  await page.goto(
    "/?UTM_SOURCE=YouTube&utm_medium=shorts&utm_campaign=video-name&utm_content=desc-1&utm_term=kw&access_token=sekret&email=ada@example.com#access_token=discord-token",
  );
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
  const origin = new URL(page.url()).origin;
  const views = (): URL[] =>
    google
      .map((url) => new URL(url))
      .filter(
        (url) =>
          url.pathname === "/g/collect" &&
          url.searchParams.get("en") === "page_view",
      );
  await expect.poll(() => views().length).toBe(1);

  const landing = views()[0];
  expect(landing?.searchParams.get("dl")).toBe(
    `${origin}/?utm_source=youtube&utm_medium=shorts&utm_campaign=video-name&utm_content=desc-1`,
  );
  const leaks = [
    "access_token",
    "sekret",
    "ada@example.com",
    "ada%40example.com",
    "discord-token",
    "utm_term",
    "YouTube",
  ];
  for (const url of google) {
    for (const leak of leaks) expect(url).not.toContain(leak);
  }

  // an early click can land before the router listens; retry until it routes
  await expect(async () => {
    await page.locator('[data-nav-item="settings"]').click();
    await expect(page).toHaveURL(/\/settings$/, { timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect.poll(() => views().length).toBe(2);
  expect(views()[1]?.searchParams.get("dl")).toBe(`${origin}/settings`);
  for (const url of google) {
    for (const leak of leaks) expect(url).not.toContain(leak);
  }
});
