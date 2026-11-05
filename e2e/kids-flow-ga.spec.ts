import { expect, test, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

const GA_REQUEST = /google-analytics|googletagmanager|gtag\/js/i;

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

function watchGa(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (request) => {
    if (GA_REQUEST.test(request.url())) hits.push(request.url());
  });
  return hits;
}

async function expectNoBanner(page: Page): Promise<void> {
  await expect(page.locator("#pt-consent-banner")).toHaveCount(0);
  await expect(page.locator("#CookiesModal:visible")).toHaveCount(0);
}

test.beforeEach(async ({ context }) => {
  await skipNgrokWarning(context);
});

test("kids slug sets kids-flow and later pages do not load GA", async ({
  page,
}) => {
  const ga = watchGa(page);
  await seedAnalyticsAccept(page);

  const landing = await page.goto("/guide/teaching-kids-to-type");
  const csp = landing?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("script-src");
  expect(csp).toContain("'self'");
  await expect(page.locator("h1")).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("puggie-kids-flow")),
  ).toBe("1");
  await expectNoBanner(page);
  await expect(page.locator("[data-consent-settings]")).toHaveCount(0);

  await page.goto("/privacy");
  await expect(page.locator("h1")).toContainText(/privacy/i);
  await expectNoBanner(page);

  await page.goto("/");
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
  await expectNoBanner(page);
  expect(ga).toEqual([]);
});

test("kids guide, start typing, then privacy stays free of GA", async ({
  page,
}) => {
  const ga = watchGa(page);
  await seedAnalyticsAccept(page);

  await page.goto("/guide/typing-for-kids");
  await page.locator("a.startTyping").click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
  await expectNoBanner(page);
  expect(
    await page.evaluate(() => sessionStorage.getItem("puggie-kids-flow")),
  ).toBe("1");

  await page.goto("/privacy");
  await expect(page.locator("h1")).toContainText(/privacy/i);
  await expectNoBanner(page);
  await page.goto("/guide/typing-tips");
  await expect(page.locator("h1")).toBeVisible();
  await expectNoBanner(page);
  expect(ga).toEqual([]);
});

test("the cookie banner does not block starting a test", async ({ page }) => {
  await page.goto("/");
  const word = page.locator("#words .word").first();
  await word.waitFor({ timeout: 60_000 });
  const text = (await word.textContent()) ?? "";
  await page.keyboard.type(`${text} `, { delay: 20 });
  await expect(page.locator("#words .word").nth(1)).toHaveClass(/active/, {
    timeout: 10_000,
  });
  await expect(page.locator("#CookiesModal:visible")).toHaveCount(0);
});
