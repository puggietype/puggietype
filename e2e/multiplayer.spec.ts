import { mkdirSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

/** SCREENS_DIR, else the brand workspace if present, else test-results */
function screensDir(): string {
  for (const dir of [
    process.env["SCREENS_DIR"],
    "/workspace/puggietype/screens",
    "test-results/screens",
  ]) {
    if (dir === undefined) continue;
    try {
      mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      // not writable here, try the next one
    }
  }
  return ".";
}
const SCREENS = screensDir();
const FAST_DELAY_MS = 25;
const SLOW_DELAY_MS = 140;

const byTestId = (page: Page, id: string): Locator =>
  page.locator(`[data-testid="${id}"]`);

const CODE_RE = /^[A-Z0-9]{8}$/;
const AGE_KEY = "puggie-mp-age-confirmed";

/** counts multiplayer WebSockets the page opens (the age gate must come first) */
function countSockets(page: Page): () => number {
  let n = 0;
  page.on("websocket", (ws) => {
    if (new URL(ws.url()).pathname === "/ws") n++;
  });
  return () => n;
}

async function passAgeGate(page: Page): Promise<void> {
  await expect(byTestId(page, "mp-age-gate")).toBeVisible();
  await expect(byTestId(page, "mp-age-gate")).toContainText(
    "You must be 13 or older to play multiplayer",
  );
  await byTestId(page, "mp-age-confirm").click();
  await expect(byTestId(page, "mp-age-gate")).toHaveCount(0);
}

/** a context whose user already passed the age gate on an earlier visit */
async function confirmedContext(
  browser: import("@playwright/test").Browser,
): Promise<import("@playwright/test").BrowserContext> {
  const ctx = await browser.newContext();
  await skipNgrokWarning(ctx);
  await ctx.addInitScript((key) => localStorage.setItem(key, "true"), AGE_KEY);
  return ctx;
}

async function waitForApp(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector("#app") !== null,
    null,
    { timeout: 60_000 },
  );
}

/** the words as rendered, so typing matches what the engine expects */
async function renderedWords(page: Page): Promise<string[]> {
  return page.$$eval("#words .word", (els) =>
    els.map((el) =>
      Array.from(el.querySelectorAll("letter"))
        .map((l) => l.textContent ?? "")
        .join(""),
    ),
  );
}

async function typeRace(page: Page, delay: number): Promise<void> {
  const words = await renderedWords(page);
  for (const [i, word] of words.entries()) {
    const last = i === words.length - 1;
    await page.keyboard.type(last ? word : `${word} `, { delay });
  }
}

async function waitForRaceStart(page: Page): Promise<void> {
  await expect(byTestId(page, "mp-race")).toBeVisible();
  await expect(byTestId(page, "mp-countdown")).toBeVisible();
  await expect(byTestId(page, "mp-countdown")).toBeHidden({ timeout: 10_000 });
}

test("two players race, see each other, get a podium and rematch", async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await skipNgrokWarning(ctxA);
  await skipNgrokWarning(ctxB);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const pageErrors: string[] = [];
  for (const p of [a, b]) {
    p.on("pageerror", (e) => pageErrors.push(e.message));
  }
  const configOf = async (p: Page, key: string): Promise<unknown> =>
    p.evaluate(
      (k) =>
        (
          window as unknown as {
            __mt?: { getConfig: Record<string, unknown> };
          }
        ).__mt?.getConfig[k],
      key,
    );

  // A: home -> race page via the header button, create a words-10 lobby
  await a.goto("/");
  await waitForApp(a);
  // over a slow public tunnel the router may not be ready yet; wait for the
  // test page to render before navigating
  await a.locator("#words .word").first().waitFor({ timeout: 60_000 });
  const socketsOfA = countSockets(a);
  // clicks during the initial page transition are dropped: retry until it lands
  await expect(async () => {
    await byTestId(a, "nav-race").click();
    await expect(byTestId(a, "race-page")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  // first visit: the 13+ gate, and no connection before it is confirmed
  await expect(byTestId(a, "mp-age-gate")).toBeVisible();
  await expect(byTestId(a, "mp-create")).toHaveCount(0);
  expect(socketsOfA()).toBe(0);
  await passAgeGate(a);
  await expect(byTestId(a, "mp-nickname")).toHaveCount(0);
  await byTestId(a, "mp-create").click();
  await expect(byTestId(a, "mp-lobby")).toBeVisible();
  const code = (await byTestId(a, "mp-room-code").innerText()).trim();
  expect(code).toMatch(CODE_RE);
  // the host's URL is the invite link right away (QA 2PM)
  await expect(a).toHaveURL(new RegExp(`/r/${code}$`));
  await byTestId(a, "mp-mode-words").click();
  await byTestId(a, "mp-length-10").click();
  await expect(byTestId(a, "mp-settings-summary")).toContainText("10 words");
  // pug mode keeps working during races
  await a.evaluate(() => {
    const mt = (
      window as unknown as {
        __mt?: { setConfig: (k: string, v: unknown) => void };
      }
    ).__mt;
    mt?.setConfig("monkey", true);
  });

  // B: joins through the invite link, after the age gate
  const socketsOfB = countSockets(b);
  await b.goto(`/r/${code}`);
  await expect(byTestId(b, "mp-age-gate")).toBeVisible();
  await b.waitForTimeout(500);
  expect(socketsOfB()).toBe(0);
  await passAgeGate(b);
  await expect(byTestId(b, "mp-lobby")).toBeVisible();
  await expect(byTestId(b, "mp-room-code")).toHaveText(code);
  await expect(byTestId(b, "mp-mode-time")).toBeDisabled();
  await expect(byTestId(a, "mp-player")).toHaveCount(2);

  // nicknames are server-assigned (e.g. ZippyPug42); B rerolls theirs
  const NICK = /^[A-Z][a-z]+[A-Z][a-z]+\d{2}$/;
  const alice = (await byTestId(a, "mp-my-name").innerText()).trim();
  const firstB = (await byTestId(b, "mp-my-name").innerText()).trim();
  expect(alice).toMatch(NICK);
  expect(firstB).toMatch(NICK);
  expect(firstB).not.toBe(alice);
  await byTestId(b, "mp-reroll").click();
  await expect(byTestId(b, "mp-my-name")).not.toHaveText(firstB);
  const bob = (await byTestId(b, "mp-my-name").innerText()).trim();
  expect(bob).toMatch(NICK);
  expect(bob).not.toBe(alice);
  await expect(byTestId(a, "mp-player").nth(1)).toContainText(bob);
  await expect(byTestId(a, "mp-player").nth(0)).toContainText(alice);
  await expect(byTestId(a, "mp-start")).toBeDisabled();
  await byTestId(b, "mp-ready").click();
  await expect(byTestId(a, "mp-start")).toBeEnabled();
  await a.waitForTimeout(400); // let the button fade in
  await a.screenshot({ path: `${SCREENS}/lobby.png` });

  // race
  const modeBefore = await configOf(a, "mode");
  await byTestId(a, "mp-start").click();
  // typing during the countdown is ignored
  await expect(byTestId(b, "mp-countdown")).toBeVisible();
  await b.keyboard.type("xyz");
  await Promise.all([waitForRaceStart(a), waitForRaceStart(b)]);
  await expect(
    b.locator("#words letter.correct, #words letter.incorrect"),
  ).toHaveCount(0);

  const words = await renderedWords(a);
  expect(words).toHaveLength(10);
  expect(await renderedWords(b)).toEqual(words);

  const typing = Promise.all([
    typeRace(a, FAST_DELAY_MS),
    typeRace(b, SLOW_DELAY_MS),
  ]);

  // mid-race: each side sees the other's caret and name tag
  const caretOnA = a.locator(
    '[data-testid="mp-opponent-caret"][data-visible="true"]',
  );
  const caretOnB = b.locator(
    '[data-testid="mp-opponent-caret"][data-visible="true"]',
  );
  await expect(caretOnA).toBeVisible();
  await expect(caretOnB).toBeVisible();
  await expect(caretOnA.locator('[data-testid="mp-opponent-tag"]')).toHaveText(
    bob,
  );
  await expect(caretOnB.locator('[data-testid="mp-opponent-tag"]')).toHaveText(
    alice,
  );
  // let both get going so the screenshot shows real progress
  await expect(caretOnB).toHaveAttribute("data-word-index", /^[3-9]$/);
  await expect(caretOnA).toHaveAttribute("data-word-index", /^[1-9]$/);
  await a.screenshot({ path: `${SCREENS}/race-midway.png` });

  await typing;

  // both reach the podium, the faster typist wins
  await expect(byTestId(a, "mp-podium")).toBeVisible({ timeout: 30_000 });
  await expect(byTestId(b, "mp-podium")).toBeVisible({ timeout: 30_000 });
  await expect(byTestId(a, "mp-winner")).toContainText(alice);
  await expect(byTestId(b, "mp-winner")).toContainText(alice);
  await expect(byTestId(a, "mp-my-place")).toHaveText("1st");
  await expect(byTestId(b, "mp-my-place")).toHaveText("2nd");
  await expect(byTestId(a, "mp-result-row")).toHaveCount(2);
  // the server's recomputation agrees with ours: nobody flagged, both finished
  await expect(byTestId(a, "mp-result-flagged")).toHaveCount(0);
  await expect(byTestId(a, "mp-results-table")).not.toContainText("dnf");
  await expect(byTestId(a, "mp-pug-winner").locator("svg")).toBeVisible();
  await expect(byTestId(b, "mp-waiting-host")).toBeVisible();
  await a.screenshot({ path: `${SCREENS}/results.png` });
  // the room's settings were only borrowed for the race
  expect(await configOf(a, "mode")).toBe(modeBefore);

  // rematch: everyone back in the lobby, un-readied
  await byTestId(a, "mp-rematch").click();
  await expect(byTestId(a, "mp-lobby")).toBeVisible();
  await expect(byTestId(b, "mp-lobby")).toBeVisible();
  await expect(byTestId(b, "mp-ready")).toContainText("ready up");

  expect(pageErrors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

type RaceSetup = {
  a: Page;
  b: Page;
  sentByA: Record<string, unknown>[];
  pageErrors: string[];
  close: () => Promise<void>;
};

/** A hosts a private lobby with these settings, B joins and readies, A starts */
async function startTwoPlayerRace(
  browser: import("@playwright/test").Browser,
  mode: "time" | "words",
  length: number,
): Promise<RaceSetup> {
  const ctxA = await confirmedContext(browser);
  const ctxB = await confirmedContext(browser);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const pageErrors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => pageErrors.push(e.message));
  const sentByA: Record<string, unknown>[] = [];
  a.on("websocket", (ws) =>
    ws.on("framesent", (f) => {
      try {
        sentByA.push(JSON.parse(String(f.payload)) as Record<string, unknown>);
      } catch {
        // not json
      }
    }),
  );

  await a.goto("/race");
  await waitForApp(a);
  await byTestId(a, "mp-create").click();
  await expect(byTestId(a, "mp-lobby")).toBeVisible();
  const code = (await byTestId(a, "mp-room-code").innerText()).trim();
  await byTestId(a, `mp-mode-${mode}`).click();
  await byTestId(a, `mp-length-${length}`).click();
  await b.goto(`/r/${code}`);
  await expect(byTestId(b, "mp-lobby")).toBeVisible();
  await byTestId(b, "mp-ready").click();
  await expect(byTestId(a, "mp-start")).toBeEnabled();
  await byTestId(a, "mp-start").click();
  await Promise.all([waitForRaceStart(a), waitForRaceStart(b)]);
  return {
    a,
    b,
    sentByA,
    pageErrors,
    close: async () => {
      await ctxA.close();
      await ctxB.close();
    },
  };
}

/** types the active word plus a space, n times */
async function typeWords(page: Page, n: number, delay: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const word = await page
      .locator("#words .word.active letter")
      .allTextContents();
    await page.keyboard.type(`${word.join("")} `, { delay });
  }
}

type SentProgress = { wordIndex: number; charIndex: number; testMs: number };

const progressOf = (msgs: Record<string, unknown>[]): SentProgress[] =>
  msgs.filter((m) => m["type"] === "race:progress") as SentProgress[];

test("reloading mid-race resumes at the same word on the race clock (MP-002)", async ({
  browser,
}) => {
  const { a, b, sentByA, pageErrors, close } = await startTwoPlayerRace(
    browser,
    "time",
    30,
  );
  // ~200 wpm, well under the server's plausibility limits
  await typeWords(a, 12, 60);
  const caretOnB = b.locator('[data-testid="mp-opponent-caret"]');
  await expect(caretOnB).toHaveAttribute("data-word-index", "12");
  const before = progressOf(sentByA).at(-1);
  expect(before?.wordIndex).toBe(12);
  const sentBefore = sentByA.length;

  // a running race asks before unloading (MP-003); confirm the reload
  a.once("dialog", (d) => void d.accept());
  await a.reload();
  await expect(byTestId(a, "mp-race")).toBeVisible({ timeout: 20_000 });
  // the caret sits on word 12 and the words before it show as typed
  await expect(a.locator("#words .word.active").first()).toHaveAttribute(
    "data-wordindex",
    "12",
    { timeout: 15_000 },
  );
  await expect(
    a.locator("#words .word[data-wordindex='11'] letter.correct"),
  ).not.toHaveCount(0);
  await typeWords(a, 3, 60);
  // progress goes out on a 100 ms interval: wait for the last word to be sent
  await expect
    .poll(() => progressOf(sentByA.slice(sentBefore)).at(-1)?.wordIndex)
    .toBe(15);
  const after = progressOf(sentByA.slice(sentBefore));
  expect(after.length).toBeGreaterThan(0);
  // never reported below where the server had us, on the shared clock
  expect(Math.min(...after.map((p) => p.wordIndex))).toBeGreaterThanOrEqual(12);
  expect(after.at(-1)?.wordIndex).toBe(15);
  expect(after[0]?.testMs ?? 0).toBeGreaterThan(before?.testMs ?? 0);
  await expect(caretOnB).toHaveAttribute("data-word-index", "15");

  // the timer ends the race; the resumed result is accepted, not flagged
  await expect(byTestId(a, "mp-podium")).toBeVisible({ timeout: 45_000 });
  await expect(byTestId(a, "mp-result-flagged")).toHaveCount(0);
  await expect(byTestId(a, "mp-my-place")).toHaveText("1st");
  const finish = sentByA.find((m) => m["type"] === "race:finish") as
    | { input: string[] }
    | undefined;
  expect(finish?.input.length).toBeGreaterThanOrEqual(15);
  expect(pageErrors).toEqual([]);
  await close();
});

test("browser Back mid-race asks first and leaves the race only if confirmed (MP-003)", async ({
  browser,
}) => {
  const { a, sentByA, pageErrors, close } = await startTwoPlayerRace(
    browser,
    "time",
    30,
  );
  await typeWords(a, 3, 60);
  const leaves = (): number =>
    sentByA.filter((m) => m["type"] === "room:leave").length;

  // closing or reloading the tab is guarded too
  const unloadBlocked = await a.evaluate(() => {
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(unloadBlocked).toBe(true);

  // cancel: still racing on the test page
  const dismissed = new Promise<string>((resolve) =>
    a.once("dialog", (d) => {
      resolve(d.message());
      // a hesitating user: the dialog blocks the page and the race timer
      setTimeout(() => void d.dismiss(), 1500);
    }),
  );
  await a.goBack();
  expect(await dismissed).toMatch(/leave the race/i);
  await expect(byTestId(a, "mp-race")).toBeVisible();
  expect(new URL(a.url()).pathname).toBe("/");
  await typeWords(a, 1, 60);
  await expect.poll(() => progressOf(sentByA).at(-1)?.wordIndex).toBe(4);
  expect(leaves()).toBe(0);
  // the blocked timer didn't end the race as a "slow timer"
  expect(sentByA.some((m) => m["type"] === "race:finish")).toBe(false);

  // confirm: leaves the room and goes back
  a.once("dialog", (d) => void d.accept());
  await a.goBack();
  await expect.poll(leaves).toBe(1);
  await expect(byTestId(a, "race-page")).toBeVisible();
  await expect(byTestId(a, "mp-race")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  await close();
});

test("the 13+ gate blocks multiplayer until confirmed, and is remembered", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await skipNgrokWarning(ctx);
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const sockets = countSockets(page);

  // an invite link shows the gate, not the lobby, and connects nowhere
  await page.goto("/r/ABCD2345");
  await waitForApp(page);
  await expect(byTestId(page, "mp-age-gate")).toBeVisible();
  await page.waitForTimeout(1000);
  expect(sockets()).toBe(0);

  // go back: home, still unconfirmed
  await byTestId(page, "mp-age-back").click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate((k) => localStorage.getItem(k), AGE_KEY)).toBe(
    null,
  );
  await page.goto("/race");
  await expect(byTestId(page, "mp-age-gate")).toBeVisible();
  expect(sockets()).toBe(0);

  // confirm: stored, and not asked again after a reload
  await passAgeGate(page);
  await expect(byTestId(page, "mp-create")).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), AGE_KEY)).toBe(
    "true",
  );
  await page.reload();
  await expect(byTestId(page, "mp-create")).toBeVisible();
  await expect(byTestId(page, "mp-age-gate")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  await ctx.close();
});

test("the host can kick a player, who lands back on /race; a host reload rejoins", async ({
  browser,
}) => {
  const ctxA = await confirmedContext(browser);
  const ctxB = await confirmedContext(browser);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const pageErrors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => pageErrors.push(e.message));
  const helloOfA: Record<string, unknown>[] = [];
  a.on("websocket", (ws) =>
    ws.on("framesent", (f) => {
      const msg = JSON.parse(String(f.payload)) as Record<string, unknown>;
      if (msg["type"] === "hello") helloOfA.push(msg);
    }),
  );

  await a.goto("/race");
  await waitForApp(a);
  await byTestId(a, "mp-create").click();
  await expect(byTestId(a, "mp-lobby")).toBeVisible();
  const code = (await byTestId(a, "mp-room-code").innerText()).trim();
  await expect(a).toHaveURL(new RegExp(`/r/${code}$`));
  expect(helloOfA[0]).toMatchObject({ type: "hello", ageConfirmed: true });

  // refreshing the host's /r/CODE rejoins the same lobby, still host
  await a.reload();
  await expect(byTestId(a, "mp-lobby")).toBeVisible();
  await expect(byTestId(a, "mp-room-code")).toHaveText(code);
  await expect(byTestId(a, "mp-start")).toBeVisible();

  await b.goto(`/r/${code}`);
  await expect(byTestId(b, "mp-lobby")).toBeVisible();
  await expect(byTestId(a, "mp-player")).toHaveCount(2);
  // only the host sees kick buttons, and never for themselves
  await expect(byTestId(b, "mp-kick")).toHaveCount(0);
  const kick = byTestId(a, "mp-kick");
  await expect(kick).toHaveCount(1);

  // two clicks: arm, then kick
  await kick.click();
  await expect(kick).toHaveAttribute("data-armed", "true");
  await kick.click();
  await expect(
    b.getByText("The host removed you from the lobby."),
  ).toBeVisible();
  await expect(b).toHaveURL(/\/race$/);
  await expect(byTestId(b, "mp-create")).toBeVisible();
  await expect(byTestId(a, "mp-player")).toHaveCount(1);

  // the kicked player can't come straight back
  await b.goto(`/r/${code}`);
  await expect(byTestId(b, "mp-lobby")).toHaveCount(0);
  await expect(b).toHaveURL(/\/race$/);
  await expect(byTestId(a, "mp-player")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

test("phone (390px): the race header stays on one line (QA-14)", async ({
  browser,
}) => {
  const phone = { viewport: { width: 390, height: 844 } };
  const ctxA = await confirmedContext(browser);
  const ctxB = await browser.newContext(phone);
  await skipNgrokWarning(ctxB);
  await ctxB.addInitScript((key) => localStorage.setItem(key, "true"), AGE_KEY);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await a.goto("/race");
  await expect(byTestId(a, "mp-create")).toBeVisible({ timeout: 60_000 });
  await byTestId(a, "mp-create").click();
  const code = (await byTestId(a, "mp-room-code").innerText()).trim();
  await b.goto(`/r/${code}`);
  await expect(byTestId(b, "mp-lobby")).toBeVisible();
  await byTestId(b, "mp-ready").click();
  await expect(byTestId(a, "mp-start")).toBeEnabled();
  await byTestId(a, "mp-start").click();
  await waitForRaceStart(b);

  const leave = byTestId(b, "mp-leave-race");
  const carets = byTestId(b, "mp-toggle-carets");
  await expect(leave).toHaveAttribute("aria-label", "leave race");
  await expect(carets).toHaveAttribute("aria-label", /opponent carets/);
  const header = leave.locator("xpath=..");
  const box = await header.boundingBox();
  const leaveBox = await leave.boundingBox();
  // one row: the header is no taller than its buttons
  expect(box?.height ?? 0).toBeLessThanOrEqual((leaveBox?.height ?? 0) + 1);
  const caretsBox = await carets.boundingBox();
  const words = await b.locator("#words").boundingBox();
  // nothing sticks out of the content column
  expect((caretsBox?.x ?? 999) + (caretsBox?.width ?? 0)).toBeLessThanOrEqual(
    (words?.x ?? 0) + (words?.width ?? 0) + 1,
  );
  // the code and the settings stay readable (only "private ·" is dropped)
  const info = header.locator("span").first();
  expect(await info.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await b.screenshot({ path: `${SCREENS}/race-header-390.png` });

  await ctxA.close();
  await ctxB.close();
});
