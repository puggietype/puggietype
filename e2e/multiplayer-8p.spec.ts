import { mkdirSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

/**
 * 8-player private race: one real browser (the host) plus 7 simulated
 * WebSocket clients that join, ready up, type at different speeds and finish.
 * A 9th client is rejected with ROOM_FULL.
 *
 * Optional env for visual checks: P8_THEME (puggie_dark), P8_WIDTH (1280),
 * P8_HEIGHT (900), P8_SHOTS=1 to save 8p-<theme>-<width>-<phase>.png.
 */
const THEME = process.env["P8_THEME"] ?? "puggie_dark";
const WIDTH = Number(process.env["P8_WIDTH"] ?? 1280);
const HEIGHT = Number(process.env["P8_HEIGHT"] ?? 900);
const SHOTS = process.env["P8_SHOTS"] === "1";
const SCREENS = process.env["SCREENS_DIR"] ?? "e2e/screens";
const BOT_WPM = [96, 88, 80, 72, 64, 56, 48];

const byTestId = (page: Page, id: string): Locator =>
  page.locator(`[data-testid="${id}"]`);

type Msg = Record<string, unknown> & { type: string };

/**
 * Simulated players live in a plain page of the site, so their sockets carry
 * the site's Origin (the server only accepts allowed origins).
 */
function installBots(): void {
  type BotMsg = Record<string, unknown> & { type: string };
  type BotState = {
    ws: WebSocket;
    inbox: BotMsg[];
    words: string[];
    startAt: number;
    offset: number;
    timer?: number;
  };
  const bots: BotState[] = [];
  (window as unknown as { __bots: unknown }).__bots = {
    async open(url: string): Promise<number> {
      const b: BotState = {
        ws: new WebSocket(url),
        inbox: [],
        words: [],
        startAt: 0,
        offset: 0,
      };
      b.ws.addEventListener("message", (e) => {
        const m = JSON.parse(String(e.data)) as BotMsg;
        b.inbox.push(m);
        if (m.type === "pong") {
          b.offset = (m["serverNow"] as number) - Date.now();
        }
        if (m.type === "race:countdown") {
          b.words = m["words"] as string[];
          b.startAt = m["startAt"] as number;
        }
      });
      await new Promise<void>((resolve, reject) => {
        b.ws.addEventListener("open", () => resolve());
        b.ws.addEventListener("error", () => reject(new Error("ws error")));
      });
      b.ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
      b.ws.send(JSON.stringify({ type: "hello", ageConfirmed: true }));
      bots.push(b);
      return bots.length - 1;
    },
    send(i: number, m: BotMsg): void {
      bots[i]?.ws.send(JSON.stringify(m));
    },
    find(i: number, type: string): BotMsg | null {
      return bots[i]?.inbox.find((m) => m.type === type) ?? null;
    },
    words(i: number): string[] {
      return bots[i]?.words ?? [];
    },
    /** type the race at `wpm`, progress at 10 Hz, then finish */
    async race(i: number, wpm: number): Promise<void> {
      const b = bots[i];
      if (b === undefined) return;
      const charsPerMs = (wpm * 5) / 60_000;
      const total = b.words.join(" ").length;
      await new Promise<void>((resolve) => {
        b.timer = window.setInterval(() => {
          const ms = Date.now() + b.offset - b.startAt;
          if (ms < 0) return;
          const typed = Math.min(total, Math.floor(ms * charsPerMs));
          let rest = typed;
          let wordIndex = 0;
          while (
            wordIndex < b.words.length - 1 &&
            rest > (b.words[wordIndex] ?? "").length
          ) {
            rest -= (b.words[wordIndex] ?? "").length + 1;
            wordIndex++;
          }
          const charIndex = Math.min(rest, (b.words[wordIndex] ?? "").length);
          const live = ms > 0 ? typed / 5 / (ms / 60_000) : 0;
          b.ws.send(
            JSON.stringify({
              type: "race:progress",
              wordIndex,
              charIndex,
              testMs: ms,
              wpm: live,
              errors: 0,
            }),
          );
          if (typed >= total) {
            window.clearInterval(b.timer);
            const final = total / 5 / (ms / 60_000);
            b.ws.send(
              JSON.stringify({
                type: "race:finish",
                wpm: final,
                raw: final,
                acc: 100,
                testMs: ms,
                input: b.words,
                keyCount: total,
              }),
            );
            resolve();
          }
        }, 100);
      });
    },
    close(i: number): void {
      const b = bots[i];
      if (b === undefined) return;
      window.clearInterval(b.timer);
      b.ws.close();
    },
  };
}

type BotApi = {
  open: (url: string) => Promise<number>;
  send: (i: number, m: Msg) => void;
  find: (i: number, type: string) => Msg | null;
  words: (i: number) => string[];
  race: (i: number, wpm: number) => Promise<void>;
  close: (i: number) => void;
};

class Bot {
  words: string[] = [];
  private page: Page;
  private i: number;
  private constructor(page: Page, i: number) {
    this.page = page;
    this.i = i;
  }

  static async open(page: Page, url: string): Promise<Bot> {
    const i = await page.evaluate(
      async (u) => (window as unknown as { __bots: BotApi }).__bots.open(u),
      url,
    );
    const bot = new Bot(page, i);
    await bot.waitFor("welcome");
    return bot;
  }

  async send(m: Msg): Promise<void> {
    await this.page.evaluate(
      ([i, msg]) =>
        (window as unknown as { __bots: BotApi }).__bots.send(i, msg),
      [this.i, m] as const,
    );
  }

  async waitFor(type: string, timeout = 20_000): Promise<Msg> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const m = await this.page.evaluate(
        ([i, t]) => (window as unknown as { __bots: BotApi }).__bots.find(i, t),
        [this.i, type] as const,
      );
      if (m) {
        if (type === "race:countdown") {
          this.words = await this.page.evaluate(
            (i) => (window as unknown as { __bots: BotApi }).__bots.words(i),
            this.i,
          );
        }
        return m;
      }
      await this.page.waitForTimeout(50);
    }
    throw new Error(`bot timed out waiting for ${type}`);
  }

  async race(wpm: number): Promise<void> {
    await this.page.evaluate(
      async ([i, w]) =>
        (window as unknown as { __bots: BotApi }).__bots.race(i, w),
      [this.i, wpm] as const,
    );
  }

  async close(): Promise<void> {
    await this.page.evaluate(
      (i) => (window as unknown as { __bots: BotApi }).__bots.close(i),
      this.i,
    );
  }
}

function wsUrl(base: string): string {
  const u = new URL(base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws";
  return u.toString();
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

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean =>
  !(
    a.x + a.width <= b.x + 0.5 ||
    b.x + b.width <= a.x + 0.5 ||
    a.y + a.height <= b.y + 0.5 ||
    b.y + b.height <= a.y + 0.5
  );

async function boxes(loc: Locator): Promise<Box[]> {
  const out: Box[] = [];
  for (const el of await loc.all()) {
    const b = await el.boundingBox();
    if (b && b.width > 0) out.push(b);
  }
  return out;
}

function expectNoOverlap(list: Box[], what: string): void {
  list.forEach((a, i) => {
    list.slice(i + 1).forEach((b, k) => {
      expect(overlaps(a, b), `${what} ${i}/${i + 1 + k} overlap`).toBe(false);
    });
  });
}

/** nothing sticks out of the viewport horizontally */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function shot(page: Page, phase: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SCREENS, { recursive: true });
  await page.screenshot({
    path: `${SCREENS}/8p-${THEME}-${WIDTH}-${phase}.png`,
    // phones: the whole lobby / results page, not just the first screen
    fullPage: WIDTH < 600 && phase !== "race",
  });
}

test("8 players race in one private room; a 9th is rejected", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    isMobile: WIDTH < 600,
    hasTouch: WIDTH < 600,
  });
  await skipNgrokWarning(ctx);
  const a = await ctx.newPage();
  const pageErrors: string[] = [];
  a.on("pageerror", (e) => pageErrors.push(e.message));
  const bots: Bot[] = [];
  const botCtx = await browser.newContext();
  await skipNgrokWarning(botCtx);
  const botPage = await botCtx.newPage();
  await botPage.goto("/privacy.html");
  await botPage.evaluate(installBots);

  try {
    await a.goto("/");
    await a.locator("#words .word").first().waitFor({ timeout: 60_000 });
    await a.evaluate((t) => {
      const s = JSON.parse(localStorage.getItem("config") ?? "{}") as object;
      localStorage.setItem(
        "config",
        JSON.stringify({ ...s, theme: t, monkey: true }),
      );
    }, THEME);
    await a.goto("/race");
    // 13+ gate before any connection
    const gate = byTestId(a, "mp-age-confirm");
    await expect(gate.or(byTestId(a, "mp-create"))).toBeVisible();
    if (await gate.isVisible()) await gate.click();
    await byTestId(a, "mp-create").click();
    await expect(byTestId(a, "mp-lobby")).toBeVisible();
    const code = (await byTestId(a, "mp-room-code").innerText()).trim();
    await byTestId(a, "mp-mode-words").click();
    await byTestId(a, "mp-length-25").click();
    await expect(byTestId(a, "mp-settings-summary")).toContainText("25 words");

    // 7 simulated players join and ready up
    const url = wsUrl(baseURL ?? "http://localhost:3000");
    for (let i = 0; i < 7; i++) {
      const bot = await Bot.open(botPage, url);
      bots.push(bot);
      await bot.send({ type: "room:join", code });
      await bot.waitFor("room:state");
      await bot.send({ type: "player:ready", ready: true });
    }
    await expect(byTestId(a, "mp-player")).toHaveCount(8);
    await expect(byTestId(a, "mp-lobby")).toContainText("8/8");
    await expect(byTestId(a, "mp-start")).toBeEnabled();

    // a 9th player is turned away
    const ninth = await Bot.open(botPage, url);
    await ninth.send({ type: "room:join", code });
    const err = await ninth.waitFor("error");
    expect(err["code"]).toBe("ROOM_FULL");
    await ninth.close();

    // 8 distinct colours, rows don't overlap or overflow
    const colors = await byTestId(a, "mp-player").evaluateAll((els) =>
      els.map(
        (el) =>
          getComputedStyle(el.querySelector("span.rounded-full") ?? el)
            .backgroundColor,
      ),
    );
    expect(new Set(colors).size).toBe(8);
    expectNoOverlap(await boxes(byTestId(a, "mp-player")), "lobby row");
    await expectNoHorizontalOverflow(a);
    await a.waitForTimeout(400);
    await shot(a, "lobby");

    // race
    await byTestId(a, "mp-start").click();
    await Promise.all(bots.map(async (b) => b.waitFor("race:countdown")));
    await expect(byTestId(a, "mp-race")).toBeVisible();
    await expect(byTestId(a, "mp-countdown")).toBeVisible();
    await expect(byTestId(a, "mp-countdown")).toBeHidden({ timeout: 10_000 });
    await expect(a.locator("#words .word")).toHaveCount(25);
    const words = await renderedWords(a);
    expect(words).toEqual(bots[0]?.words);
    const racing = bots.map(async (b, i) => b.race(BOT_WPM[i] ?? 60));
    // the host types the first few words, then pauses for the checks
    for (const w of words.slice(0, 3)) {
      await a.keyboard.type(`${w} `, { delay: 60 });
    }

    const carets = a.locator(
      '[data-testid="mp-opponent-caret"][data-visible="true"]',
    );
    await expect(carets).toHaveCount(7, { timeout: 15_000 });
    await expect(byTestId(a, "mp-progress-row")).toHaveCount(8);
    // wait for the field to spread out, then check the tags don't pile up
    await a.waitForTimeout(2500);
    await a.waitForTimeout(300); // let tag stacking settle a frame or two
    // measure all tags in one frame (they move every frame), a few times
    for (let n = 0; n < 5; n++) {
      const tags = await a.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            '[data-testid="mp-opponent-caret"][data-visible="true"][data-tag="shown"] [data-testid="mp-opponent-tag"]',
          ),
        ).map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      );
      expect(tags.length).toBeGreaterThanOrEqual(3);
      expectNoOverlap(tags, "caret tag");
      await a.waitForTimeout(150);
    }
    const tagColors = await a
      .locator('[data-testid="mp-opponent-tag"]')
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).backgroundColor),
      );
    expect(new Set(tagColors).size).toBe(7);
    expectNoOverlap(
      await boxes(byTestId(a, "mp-progress-row")),
      "progress row",
    );
    await expectNoHorizontalOverflow(a);
    await shot(a, "race");

    // host finishes the race
    for (const [i, w] of words.slice(3).entries()) {
      const last = i === words.length - 4;
      await a.keyboard.type(last ? w : `${w} `, { delay: 60 });
    }
    await Promise.all(racing);

    await expect(byTestId(a, "mp-podium")).toBeVisible({ timeout: 60_000 });
    await expect(byTestId(a, "mp-result-row")).toHaveCount(8);
    await expect(byTestId(a, "mp-results-table")).not.toContainText("dnf");
    const flagged = await byTestId(a, "mp-result-row")
      .filter({ has: byTestId(a, "mp-result-flagged") })
      .allInnerTexts();
    expect(flagged).toEqual([]);
    expectNoOverlap(await boxes(byTestId(a, "mp-result-row")), "result row");
    await expectNoHorizontalOverflow(a);
    await a.waitForTimeout(600);
    await shot(a, "results");

    expect(pageErrors).toEqual([]);
  } finally {
    for (const b of bots) await b.close().catch(() => undefined);
    await botCtx.close();
    await ctx.close();
  }
});
