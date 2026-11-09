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

type Box = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

function overlapArea(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

test.use({ viewport: { width: 1280, height: 720 } });

test.beforeEach(async ({ context }) => {
  await skipNgrokWarning(context);
});

test("the cookie banner does not cover the words at 1280x720", async ({
  page,
}, testInfo) => {
  const ga = watchGa(page);
  await abortGa(page);
  await page.goto("/");
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
  await expect(page.locator("#consent-accept")).toBeVisible();
  await expect(page.locator("#consent-reject")).toBeVisible();

  const boxes = await page.evaluate(
    (): {
      first: Box;
      dialog: Box;
      card: Box;
      covered: number;
      viewport: { width: number; height: number };
    } => {
      const rect = (selector: string): DOMRect => {
        const el = document.querySelector(selector);
        if (el === null) throw new Error(`missing ${selector}`);
        return el.getBoundingClientRect();
      };
      const clip = (el: Element): DOMRect => {
        const r = el.getBoundingClientRect();
        let top = r.top;
        let left = r.left;
        let right = r.right;
        let bottom = r.bottom;
        let parent = el.parentElement;
        while (parent !== null) {
          const style = getComputedStyle(parent);
          if (style.overflowY !== "visible" || style.overflowX !== "visible") {
            const box = parent.getBoundingClientRect();
            top = Math.max(top, box.top);
            bottom = Math.min(bottom, box.bottom);
            left = Math.max(left, box.left);
            right = Math.min(right, box.right);
          }
          parent = parent.parentElement;
        }
        return new DOMRect(
          left,
          top,
          Math.max(0, right - left),
          Math.max(0, bottom - top),
        );
      };
      const area = (
        a: { left: number; right: number; top: number; bottom: number },
        b: { left: number; right: number; top: number; bottom: number },
      ): number => {
        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (width <= 0 || height <= 0) return 0;
        return width * height;
      };
      const dialog = rect("#CookiesModal");
      const card = rect("#CookiesModal .modal");
      let covered = 0;
      for (const word of document.querySelectorAll("#words .word")) {
        covered += area(clip(word), dialog);
      }
      const first = clip(
        document.querySelector("#words .word") ?? document.body,
      );
      const pack = (value: DOMRect): Box => ({
        left: value.left,
        right: value.right,
        top: value.top,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      });
      return {
        first: pack(first),
        dialog: pack(dialog),
        card: pack(card),
        covered,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    },
  );
  expect(boxes.first.width).toBeGreaterThan(20);
  expect(boxes.first.height).toBeGreaterThan(10);
  expect(boxes.dialog.width).toBeGreaterThan(200);
  expect(boxes.dialog.height).toBeGreaterThan(80);
  expect(boxes.covered).toBe(0);
  expect(overlapArea(boxes.dialog, boxes.card)).toBeGreaterThan(0);
  expect(boxes.dialog.width).toBeLessThan(boxes.viewport.width * 0.5);
  expect(boxes.dialog.height).toBeLessThan(boxes.viewport.height * 0.55);
  expect(ga).toEqual([]);
  expect(await page.locator("script[src*='googletagmanager']").count()).toBe(0);

  const shot = testInfo.outputPath("consent-banner-1280x720.png");
  await page.screenshot({ path: shot });
  await testInfo.attach("consent-banner-1280x720", {
    path: shot,
    contentType: "image/png",
  });

  const axe = await new AxeBuilder({ page }).include("#CookiesModal").analyze();
  const serious = axe.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious.map((violation) => violation.id)).toEqual([]);

  const input = page.locator("#wordsInput");
  await input.focus();
  await page.locator("#consent-accept").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#consent-reject")).toBeFocused();
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
  expect(ga).toEqual([]);

  const word = (await page.locator("#words .word").first().textContent()) ?? "";
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
