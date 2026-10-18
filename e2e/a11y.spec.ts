import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// QA-08: no critical axe violations on the launch pages

const AGE_KEY = "puggie-mp-age-confirmed";

async function criticals(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.nodes.length}): ${v.nodes
          .slice(0, 5)
          .map((n) => n.target.join(" "))
          .join(", ")}`,
    );
}

async function openShown(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => {
    const app = document.querySelector("#app");
    return (
      app !== null &&
      !app.classList.contains("hidden") &&
      getComputedStyle(app).opacity === "1"
    );
  });
  await page.waitForTimeout(500);
}

test.beforeEach(async ({ context }) => {
  await skipNgrokWarning(context);
});

for (const path of ["/", "/settings", "/about", "/race"]) {
  test(`no critical axe violations on ${path}`, async ({ page }) => {
    await openShown(page, path);
    expect(await criticals(page)).toEqual([]);
  });
}

test("no critical axe violations in a /race lobby", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "true"), AGE_KEY);
  await openShown(page, "/race");
  await page.locator('[data-testid="mp-create"]').click();
  await expect(page.locator('[data-testid="mp-lobby"]')).toBeVisible();
  expect(await criticals(page)).toEqual([]);
});
