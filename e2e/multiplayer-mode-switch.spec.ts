import { expect, test, type Locator, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// Local servers only (see playwright.config.ts). A lobby switching mode
// between races must end each race its own mode's way.

const AGE_KEY = "puggie-mp-age-confirmed";
const LENGTH = { time: 15, words: 10 } as const;
type Mode = keyof typeof LENGTH;

const byTestId = (page: Page, id: string): Locator =>
  page.locator(`[data-testid="${id}"]`);

const configOf = async (page: Page, key: string): Promise<unknown> =>
  page.evaluate(
    (k) =>
      (window as unknown as { __mt?: { getConfig: Record<string, unknown> } })
        .__mt?.getConfig[k],
    key,
  );

async function typeWords(page: Page, n: number, delay: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const letters = await page
      .locator("#words .word.active letter")
      .allTextContents();
    if (letters.length === 0) return;
    await page.keyboard.type(`${letters.join("")} `, { delay });
  }
}

/** one player's race; returns ms from the start until the podium */
async function play(page: Page, mode: Mode, delay: number): Promise<number> {
  await expect(byTestId(page, "mp-race")).toBeVisible();
  await expect(byTestId(page, "mp-countdown")).toBeHidden({ timeout: 10_000 });
  expect(await configOf(page, "mode")).toBe(mode);
  const words = await page.locator("#words .word").count();
  if (mode === "words") expect(words).toBe(LENGTH.words);
  const t0 = Date.now();
  await typeWords(page, mode === "words" ? words : 3, delay);
  if (mode === "words") {
    // the words ending: done the moment the last word is in
    await expect(
      byTestId(page, "mp-waiting").or(byTestId(page, "mp-podium")).first(),
    ).toBeVisible({ timeout: 5_000 });
  } else {
    // the timed ending: still racing until the clock runs out
    await page.waitForTimeout(3_000);
    await expect(byTestId(page, "mp-race")).toBeVisible();
    expect(await configOf(page, "mode")).toBe("time");
  }
  await expect(byTestId(page, "mp-podium")).toBeVisible({ timeout: 30_000 });
  return Date.now() - t0;
}

test("switching mode between races: each race ends its own mode's way", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const pages: Page[] = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext();
    await skipNgrokWarning(ctx);
    await ctx.addInitScript(
      (key) => localStorage.setItem(key, "true"),
      AGE_KEY,
    );
    pages.push(await ctx.newPage());
  }
  const [host, guest] = pages as [Page, Page];
  await host.goto("/race");
  await byTestId(host, "mp-create").click({ timeout: 60_000 });
  await expect(byTestId(host, "mp-lobby")).toBeVisible();
  const code = (await byTestId(host, "mp-room-code").innerText()).trim();
  await guest.goto(`/r/${code}`);
  await expect(byTestId(guest, "mp-lobby")).toBeVisible({ timeout: 60_000 });

  for (const mode of ["time", "words", "time", "words"] as const) {
    await byTestId(host, `mp-mode-${mode}`).click();
    await byTestId(host, `mp-length-${LENGTH[mode]}`).click();
    await expect(byTestId(guest, "mp-settings-summary")).toContainText(
      mode === "time" ? `${LENGTH.time}` : `${LENGTH.words} words`,
    );
    await byTestId(guest, "mp-ready").click();
    await byTestId(host, "mp-start").click();
    const [hostMs, guestMs] = await Promise.all([
      play(host, mode, 30),
      play(guest, mode, 60),
    ]);
    for (const ms of [hostMs, guestMs]) {
      if (mode === "time") expect(ms).toBeGreaterThan(10_000);
      else expect(ms).toBeLessThan(20_000);
    }
    await byTestId(host, "mp-back-to-lobby").click();
    await expect(byTestId(guest, "mp-lobby")).toBeVisible();
  }
  for (const p of pages) await p.context().close();
});
