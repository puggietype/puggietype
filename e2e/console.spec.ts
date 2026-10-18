import { expect, test } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// no console errors or warnings on page load (QA-10: the version button used
// to log a GitHub releases 404 on every page)

test.beforeEach(async ({ context }) => {
  await skipNgrokWarning(context);
});

for (const path of ["/", "/race", "/settings", "/about"]) {
  test(`clean console on ${path}`, async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") {
        messages.push(`${m.type()}: ${m.text()}`);
      }
    });
    page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}`));
    const github: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("api.github.com")) github.push(r.url());
    });
    await page.goto(path);
    await page.locator("#app:not(.hidden)").waitFor();
    // the preload-unused warning fires a few seconds after load
    await page.waitForTimeout(4000);
    expect(messages).toEqual([]);
    expect(github).toEqual([]);
  });
}
