import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// Character select (spec §11). Needs the WS server with
// FEATURE_CHARACTER_SELECT=1; the client flags come from ?flags=.
const FLAGS = "?flags=characterSelect,opponentDogs";
const AGE_KEY = "puggie-mp-age-confirmed";
const CHARACTER_KEY = "puggie-mp-character";

const byTestId = (page: Page, id: string): Locator =>
  page.locator(`[data-testid="${id}"]`);

async function playerContext(
  browser: Browser,
  opts: { reducedMotion?: "reduce" } = {},
): Promise<BrowserContext> {
  const ctx = await browser.newContext(opts);
  await skipNgrokWarning(ctx);
  await ctx.addInitScript((key) => localStorage.setItem(key, "true"), AGE_KEY);
  return ctx;
}

async function renderedWords(page: Page): Promise<string[]> {
  return page.$$eval("#words .word", (els) =>
    els.map((el) =>
      Array.from(el.querySelectorAll("letter"))
        .map((l) => l.textContent ?? "")
        .join(""),
    ),
  );
}

/** A hosts a 10-word room, B joins; both on the race page */
async function lobby(a: Page, b: Page): Promise<string> {
  await a.goto(`/race${FLAGS}`);
  await byTestId(a, "mp-create").click();
  const code = (await byTestId(a, "mp-room-code").innerText()).trim();
  await byTestId(a, "mp-mode-words").click();
  await byTestId(a, "mp-length-10").click();
  await b.goto(`/r/${code}${FLAGS}`);
  await expect(byTestId(a, "mp-player")).toHaveCount(2);
  return code;
}

const playerDog = (page: Page, playerId: string): Locator =>
  page.locator(
    `[data-testid="mp-player"][data-player-id="${playerId}"] [data-testid="mp-player-character"]`,
  );

async function myId(page: Page): Promise<string> {
  return (
    (await page
      .locator('[data-testid="mp-player"]', {
        has: page.locator("text=(you)"),
      })
      .getAttribute("data-player-id")) ?? ""
  );
}

test("players pick dogs, see each other's, lock on ready, race and podium", async ({
  browser,
}) => {
  const ctxA = await playerContext(browser);
  const ctxB = await playerContext(browser);
  await ctxB.addInitScript(
    (key) => localStorage.setItem(key, "chowie"),
    CHARACTER_KEY,
  );
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await lobby(a, b);
  const idA = await myId(a);
  const idB = await myId(b);

  // B's saved pick went out in hello; A picks with the mouse
  await expect(playerDog(a, idB)).toHaveAttribute("data-character", "chowie");
  await byTestId(a, "mp-character-corgie").click();
  await expect(byTestId(a, "mp-character-corgie")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(playerDog(b, idA)).toHaveAttribute("data-character", "corgie");
  expect(await a.evaluate((k) => localStorage.getItem(k), CHARACTER_KEY)).toBe(
    "corgie",
  );

  // keyboard only: arrows move and select within the radiogroup
  await byTestId(b, "mp-character-chowie").focus();
  await b.keyboard.press("ArrowRight");
  await expect(byTestId(b, "mp-character-frenchie")).toBeFocused();
  await expect(byTestId(b, "mp-character-frenchie")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await b.keyboard.press("ArrowDown");
  await expect(byTestId(b, "mp-character-shibie")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(playerDog(a, idB)).toHaveAttribute("data-character", "shibie");

  // ready locks the picker
  await byTestId(b, "mp-ready").click();
  await expect(byTestId(b, "mp-character-picker")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await byTestId(b, "mp-character-goldie").click({ force: true });
  await expect(playerDog(a, idB)).toHaveAttribute("data-character", "shibie");

  // race: A sees B's shibie paddle while B types
  await byTestId(a, "mp-start").click();
  await expect(byTestId(a, "mp-countdown")).toBeVisible();
  await expect(byTestId(a, "mp-countdown")).toBeHidden({ timeout: 10_000 });
  const oppDog = a.locator(
    `[data-testid="mp-opponent-dog"][data-player-id="${idB}"]`,
  );
  await expect(oppDog).toHaveAttribute("data-character", "shibie");
  const frames = new Set<string>();
  const words = await renderedWords(b);
  for (const word of words.slice(0, -1)) {
    await b.keyboard.type(`${word} `, { delay: 60 });
    frames.add((await oppDog.getAttribute("data-frame")) ?? "");
  }
  expect(frames.has("left") || frames.has("right")).toBe(true);
  await b.keyboard.type(words.at(-1) ?? "", { delay: 50 });
  await expect(oppDog).toHaveAttribute("data-frame", "winnerSmall");
  await a.keyboard.type((await renderedWords(a)).join(" "), { delay: 50 });

  // podium: the winner's dog, with alt text
  await expect(byTestId(a, "mp-podium")).toBeVisible({ timeout: 30_000 });
  const winner = byTestId(a, "mp-pug-winner");
  await expect(winner).toHaveAttribute("data-character", "shibie");
  await expect(winner).toHaveAttribute("aria-label", /'s Shibie$/);
  await ctxA.close();
  await ctxB.close();
});

test("reduced motion: opponent dogs stay idle", async ({ browser }) => {
  const ctxA = await playerContext(browser, { reducedMotion: "reduce" });
  const ctxB = await playerContext(browser);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await lobby(a, b);
  const idB = await myId(b);
  await byTestId(b, "mp-ready").click();
  await byTestId(a, "mp-start").click();
  await expect(byTestId(a, "mp-countdown")).toBeHidden({ timeout: 10_000 });
  const oppDog = a.locator(
    `[data-testid="mp-opponent-dog"][data-player-id="${idB}"]`,
  );
  await expect(oppDog).toBeVisible();
  for (const word of (await renderedWords(b)).slice(0, 4)) {
    await b.keyboard.type(`${word} `, { delay: 60 });
    await expect(oppDog).toHaveAttribute("data-frame", "idle");
  }
  await ctxA.close();
  await ctxB.close();
});

test("flags off: no picker, no opponent dogs", async ({ browser }) => {
  const ctx = await playerContext(browser);
  const page = await ctx.newPage();
  await page.goto("/race?flags=none");
  await byTestId(page, "mp-create").click();
  await expect(byTestId(page, "mp-lobby")).toBeVisible();
  await expect(byTestId(page, "mp-character-picker")).toHaveCount(0);
  await expect(byTestId(page, "mp-player-character")).toHaveCount(0);
  await ctx.close();
});
