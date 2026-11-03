import { expect, test } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// Every top-nav item must sit fully on screen at every width (LN-01).
test("nav items never clip, 320..1400px", async ({ page, context }) => {
  await skipNgrokWarning(context);
  await page.goto("/");
  await page.locator("nav [data-nav-item]").first().waitFor();
  const failures: string[] = [];
  for (let width = 320; width <= 1400; width += 8) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(50);
    const bad = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      return [...document.querySelectorAll<HTMLElement>("nav [data-nav-item]")]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({
          item: el.dataset["navItem"],
          left: el.getBoundingClientRect().left,
          right: el.getBoundingClientRect().right,
          vw,
        }))
        .filter((r) => r.right > r.vw + 0.5 || r.left < -0.5);
    });
    for (const b of bad) {
      failures.push(`${width}px: ${b.item} ${b.left}-${b.right} > ${b.vw}`);
    }
  }
  expect(failures).toEqual([]);
});
