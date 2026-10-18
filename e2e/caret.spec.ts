import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// Jake's ghost caret: a second caret stuck at the start of the words in solo.
// Root cause was a multiplayer race that kept running on the test page after
// choosing solo (its idle opponent caret sat at word 0). These guard both the
// plain solo restart loop and the race -> solo path.

const AGE_KEY = "puggie-mp-age-confirmed";
const byTestId = (page: Page, id: string): Locator =>
  page.locator(`[data-testid="${id}"]`);

type Caret = { id: string; x: number; y: number };

/** every caret-like element that is actually painted */
async function visibleCarets(page: Page): Promise<Caret[]> {
  return page.$$eval(
    '#caret, #paceCaret, [data-testid="mp-opponent-caret"]',
    (els) =>
      els
        .filter((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return (
            s.display !== "none" &&
            s.visibility !== "hidden" &&
            Number(s.opacity) > 0.05 &&
            r.height > 0
          );
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id:
              el.id !== ""
                ? el.id
                : ((el as HTMLElement).dataset["testid"] ?? "?"),
            x: r.left,
            y: r.top,
          };
        }),
  );
}

async function activeWord(page: Page): Promise<string> {
  return page.$$eval("#words .word.active letter", (ls) =>
    ls.map((l) => l.textContent ?? "").join(""),
  );
}

/** x where the live caret belongs: next untyped letter, else after the word */
async function nextLetterX(page: Page): Promise<number> {
  return page.$eval("#words .word.active", (w) => {
    const next = w.querySelector("letter:not(.correct):not(.incorrect)");
    if (next !== null) return next.getBoundingClientRect().left;
    const letters = w.querySelectorAll("letter");
    return letters[letters.length - 1]?.getBoundingClientRect().right ?? 0;
  });
}

async function openSolo(browser: Browser, config: object): Promise<Page> {
  const ctx = await browser.newContext();
  await skipNgrokWarning(ctx);
  await ctx.addInitScript((cfg) => {
    if (sessionStorage.getItem("caret-seeded") === null) {
      localStorage.setItem("config", JSON.stringify(cfg));
      sessionStorage.setItem("caret-seeded", "1");
    }
  }, config);
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator("#words .word").first()).toBeVisible({
    timeout: 60_000,
  });
  return page;
}

for (const [name, config, pace] of [
  ["default config", {}, false],
  ["pace caret off", { paceCaret: "off" }, false],
  ["pace caret on", { paceCaret: "custom", paceCaretCustomSpeed: 60 }, true],
] as const) {
  test(`solo: 20 restarts keep exactly one caret (${name})`, async ({
    browser,
  }) => {
    const page = await openSolo(browser, config);
    for (let i = 0; i < 20; i++) {
      // restart from a fresh test, mid-word, and after a finished word
      const w = await activeWord(page);
      if (i % 3 === 1) await page.keyboard.type(w.slice(0, 2), { delay: 20 });
      if (i % 3 === 2) await page.keyboard.type(`${w} `, { delay: 20 });
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(i % 2 === 0 ? 350 : 60);
      await page.keyboard.type((await activeWord(page)).slice(0, 2), {
        delay: 40,
      });
      await page.waitForTimeout(pace ? 700 : 250);

      // exactly one live caret, settled on the next letter to type
      await expect
        .poll(
          async () => {
            const carets = await visibleCarets(page);
            const live = carets.filter((c) => c.id === "caret");
            if (live.length !== 1) return `carets ${JSON.stringify(carets)}`;
            const dx = Math.abs(
              (live[0]?.x ?? -99) - (await nextLetterX(page)),
            );
            return dx < 6 ? "ok" : `live caret ${dx.toFixed(1)}px off`;
          },
          { message: `restart ${i}`, timeout: 3000 },
        )
        .toBe("ok");
      const carets = await visibleCarets(page);
      const liveY = carets.find((c) => c.id === "caret")?.y ?? -999;
      const others = carets.filter((c) => c.id !== "caret");
      const started =
        (await page
          .locator("#words letter.correct, #words letter.incorrect")
          .count()) > 0;
      if (pace && started) {
        // the pace caret appears once the test runs, on the live line
        expect(
          others.map((c) => c.id),
          `restart ${i}: ${JSON.stringify(carets)}`,
        ).toEqual(["paceCaret"]);
        expect(Math.abs((others[0]?.y ?? 9999) - liveY)).toBeLessThan(80);
      } else {
        expect(others, `restart ${i}`).toHaveLength(0);
      }
    }
    await page.context().close();
  });
}

test("race -> solo: choosing solo leaves the race, no ghost opponent caret", async ({
  browser,
}) => {
  const newCtx = async (): Promise<BrowserContext> => {
    const c = await browser.newContext();
    await skipNgrokWarning(c);
    await c.addInitScript((key) => localStorage.setItem(key, "true"), AGE_KEY);
    return c;
  };
  const hostCtx = await newCtx();
  const guestCtx = await newCtx();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  await host.goto("/race");
  await byTestId(host, "mp-create").click();
  await expect(byTestId(host, "mp-lobby")).toBeVisible();
  const code = (await byTestId(host, "mp-room-code").innerText()).trim();
  await guest.goto(`/r/${code}`);
  await expect(byTestId(guest, "mp-lobby")).toBeVisible();
  await byTestId(guest, "mp-ready").click();
  await expect(byTestId(host, "mp-start")).toBeEnabled();
  await byTestId(host, "mp-start").click();
  await expect(byTestId(host, "mp-race")).toBeVisible();
  await expect(byTestId(host, "mp-countdown")).toHaveCount(0, {
    timeout: 15_000,
  });
  await host.keyboard.type(`${await activeWord(host)} `, { delay: 30 });
  // guest idles at word 0: its caret is the "ghost" at the start
  await expect
    .poll(async () => (await visibleCarets(host)).map((c) => c.id))
    .toContain("mp-opponent-caret");

  host.once("dialog", async (d) => {
    await d.accept();
  });
  await host.locator('[router-link][href="/"]').first().click();
  await expect(byTestId(host, "mp-race")).toHaveCount(0);

  for (let i = 0; i < 5; i++) {
    await host.keyboard.press("Tab");
    await host.keyboard.press("Enter");
    await host.waitForTimeout(300);
    await host.keyboard.type((await activeWord(host)).slice(0, 1));
    await host.waitForTimeout(300);
    const ids = (await visibleCarets(host)).map((c) => c.id);
    expect(ids, `solo restart ${i}`).toEqual(["caret"]);
  }
  await hostCtx.close();
  await guestCtx.close();
});
