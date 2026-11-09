import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

const GA_REQUEST = /google-analytics|googletagmanager|analytics\.google/i;

function watchGa(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (request) => {
    if (GA_REQUEST.test(request.url())) hits.push(request.url());
  });
  return hits;
}

async function abortGa(page: Page): Promise<void> {
  await page.route(GA_REQUEST, async (route) => {
    await route.abort();
  });
}

test.use({ viewport: { width: 1280, height: 720 } });

test.beforeEach(async ({ context }) => {
  await skipNgrokWarning(context);
});

type WordFit = {
  total: number;
  shown: number;
  lines: number;
  covered: number;
  overflowY: string;
  barHeight: number;
  barWidth: number;
};

async function wordFit(page: Page): Promise<WordFit> {
  return page.evaluate((): WordFit => {
    const wrap = document.querySelector("#wordsWrapper");
    const banner = document.getElementById("CookiesModal");
    const words = [...document.querySelectorAll("#words .word")];
    const wrapBox =
      wrap instanceof HTMLElement ? wrap.getBoundingClientRect() : null;
    const open =
      banner instanceof HTMLElement &&
      getComputedStyle(banner).display !== "none" &&
      banner.getBoundingClientRect().height > 0;
    const bar =
      open && banner instanceof HTMLElement
        ? banner.getBoundingClientRect()
        : null;
    let shown = 0;
    let covered = 0;
    const lineTops = new Set<number>();
    for (const node of words) {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || wrapBox === null) continue;
      const fullyShown =
        rect.top >= wrapBox.top - 1 &&
        rect.bottom <= wrapBox.bottom + 1 &&
        rect.left >= wrapBox.left - 1 &&
        rect.right <= wrapBox.right + 1;
      if (fullyShown) {
        shown += 1;
        lineTops.add(Math.round(rect.top / 4));
      }
      if (
        bar !== null &&
        rect.bottom > bar.top + 0.5 &&
        rect.top < bar.bottom &&
        rect.bottom > wrapBox.top &&
        rect.top < wrapBox.bottom
      ) {
        covered += 1;
      }
    }
    return {
      total: words.length,
      shown,
      lines: lineTops.size,
      covered,
      overflowY: wrap === null ? "" : getComputedStyle(wrap).overflowY,
      barHeight: bar?.height ?? 0,
      barWidth: bar?.width ?? 0,
    };
  });
}

const VIEWPORTS: Array<[number, number]> = [
  [1280, 720],
  [1280, 600],
  [1024, 768],
  [390, 844],
  [320, 700],
];

test("the banner leaves the full word list usable", async ({
  page,
}, testInfo) => {
  const ga = watchGa(page);
  await abortGa(page);

  const bare = await page.context().browser()?.newContext();
  if (bare === undefined) throw new Error("no browser");
  const plain = await bare.newPage();
  await plain.addInitScript(() => {
    localStorage.setItem(
      "acceptedCookies",
      JSON.stringify({
        security: true,
        analytics: false,
        doNotSellOrShare: true,
      }),
    );
  });

  for (const [width, height] of VIEWPORTS) {
    await plain.setViewportSize({ width, height });
    await plain.goto("/");
    await plain.locator("#words .word").first().waitFor({ timeout: 60_000 });
    const before = await wordFit(plain);

    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
    await expect(page.locator("#consent-accept")).toBeVisible();
    const after = await wordFit(page);
    expect(after.total, `${width}x${height} word count`).toBe(before.total);
    expect(after.lines, `${width}x${height} visible lines`).toBe(before.lines);
    expect(after.shown, `${width}x${height} visible words`).toBeGreaterThan(0);
    expect(after.covered, `${width}x${height} covered`).toBe(0);
    expect(after.overflowY, `${width}x${height}`).toBe(before.overflowY);
    expect(after.barHeight).toBeGreaterThan(24);
    expect(after.barHeight).toBeLessThan(160);
    expect(after.barWidth).toBeGreaterThan(width * 0.9);
    for (const id of ["#consent-accept", "#consent-reject"]) {
      const box = await page.locator(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box?.x ?? 0, id).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0), id).toBeLessThanOrEqual(
        width + 1,
      );
    }
  }

  await page.setViewportSize({ width: 1280, height: 500 });
  await page.waitForTimeout(200);
  const resized = await wordFit(page);
  expect(resized.covered, "resized").toBe(0);
  expect(resized.shown, "resized").toBeGreaterThan(0);
  expect(resized.total).toBeGreaterThan(resized.shown);
  await bare.close();

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator("#consent-accept").waitFor();
  expect(ga).toEqual([]);

  const shot = testInfo.outputPath("consent-banner-1280x720.png");
  await page.screenshot({ path: shot });
  await testInfo.attach("consent-banner-1280x720", {
    path: shot,
    contentType: "image/png",
  });

  const axe = await new AxeBuilder({ page }).include("#CookiesModal").analyze();
  expect(
    axe.violations
      .filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      )
      .map((violation) => violation.id),
  ).toEqual([]);

  const input = page.locator("#wordsInput");
  await input.focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("#CookiesModal")).toBeHidden();
  await expect(input).toBeFocused();
  const stored = await page.evaluate(
    () => localStorage.getItem("acceptedCookies") ?? "",
  );
  expect(JSON.parse(stored) as unknown).toEqual({
    security: true,
    analytics: false,
    doNotSellOrShare: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("#CommandlineModal")).toBeVisible();
  expect(ga).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(page.locator("#CommandlineModal")).toBeHidden();
  const word = (await page.locator("#words .word").first().textContent()) ?? "";
  await input.focus();
  await page.keyboard.type(`${word} `, { delay: 15 });
  await expect(page.locator("#words .word").nth(1)).toHaveClass(/active/);
});

test("a static page banner matches accept and reject and stays GA-free", async ({
  page,
}) => {
  const ga = watchGa(page);
  await abortGa(page);
  await page.goto("/privacy");
  const banner = page.locator("#pt-consent-banner");
  await expect(banner).toBeVisible();
  const buttons = banner.locator(".consentActions button");
  await expect(buttons).toHaveCount(2);
  const acceptBox = await buttons.nth(0).boundingBox();
  const rejectBox = await buttons.nth(1).boundingBox();
  expect(acceptBox).not.toBeNull();
  expect(rejectBox).not.toBeNull();
  expect(
    Math.abs((acceptBox?.width ?? 0) - (rejectBox?.width ?? 0)),
  ).toBeLessThan(2);
  expect(
    Math.abs((acceptBox?.height ?? 0) - (rejectBox?.height ?? 0)),
  ).toBeLessThan(2);
  await expect(buttons.nth(0)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(buttons.nth(1)).toBeFocused();
  const axe = await new AxeBuilder({ page })
    .include("#pt-consent-banner")
    .analyze();
  expect(
    axe.violations
      .filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      )
      .map((violation) => violation.id),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(banner).toHaveCount(0);
  expect(ga).toEqual([]);
  await page.reload();
  await expect(page.locator("#pt-consent-banner")).toHaveCount(0);
  expect(ga).toEqual([]);
});
