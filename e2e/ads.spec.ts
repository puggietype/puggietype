import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// Ads switch and placements. Runs against production builds (vite build +
// vite preview), one per mode, each skipped unless its URL is set:
//  ADS_OFF_URL          default build (VITE_ADS_ENABLED unset)
//  ADS_ADSENSE_URL      VITE_ADS_ENABLED=true, committed config.json (ads off)
//  ADS_PLACEHOLDER_URL  VITE_ADS_ENABLED=true VITE_ADS_PROVIDER=placeholder;
//                       the tests serve {"ads": true} as /config.json
// The lobby/race test also needs the WS server behind the preview's /ws
// proxy (ALLOW_SOLO=1). Requests to Google ad hosts are always aborted, so a
// bug can never load a live ad.

const OFF_URL = process.env["ADS_OFF_URL"];
const ADSENSE_URL = process.env["ADS_ADSENSE_URL"];
const PLACEHOLDER_URL = process.env["ADS_PLACEHOLDER_URL"];

const AD_HOSTS =
  /googlesyndication|doubleclick|fundingchoices|adtrafficquality|adservice/;
const AGE_KEY = "puggie-mp-age-confirmed";
const CLEARANCE_PX = 150;

const byTestId = (page: Page, id: string): Locator =>
  page.locator(`[data-testid="${id}"]`);

type Watch = {
  adRequests: string[];
  configRequests: string[];
  adChunks: string[];
};

async function watch(context: BrowserContext): Promise<Watch> {
  const w: Watch = { adRequests: [], configRequests: [], adChunks: [] };
  await skipNgrokWarning(context);
  await context.route(
    (url) => AD_HOSTS.test(url.hostname),
    async (route) => route.abort(),
  );
  context.on("request", (req) => {
    const url = new URL(req.url());
    if (AD_HOSTS.test(url.hostname)) w.adRequests.push(req.url());
    if (url.pathname === "/config.json") w.configRequests.push(req.url());
    if (/\/js\/(adsense|placeholder)\./.test(url.pathname)) {
      w.adChunks.push(url.pathname);
    }
  });
  return w;
}

/** serve the server switch */
async function serveSwitch(
  context: BrowserContext,
  ads: boolean,
): Promise<void> {
  await context.route("**/config.json", async (route) =>
    route.fulfill({ contentType: "application/json", body: `{"ads":${ads}}` }),
  );
}

async function openTest(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("config") ?? "{}") as Record<
      string,
      unknown
    >;
    localStorage.setItem(
      "config",
      JSON.stringify({ ...saved, mode: "words", words: 10 }),
    );
  });
  await page.reload();
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
}

async function finishTest(page: Page): Promise<void> {
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    if (await page.locator("#result").isVisible()) return;
    const word = await page
      .locator("#words .word.active")
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    if (word === null) continue;
    await page.keyboard.type(`${word} `, { delay: 15 });
  }
  await expect(page.locator("#result")).toBeVisible();
}

async function expectNoAdDom(page: Page): Promise<void> {
  const counts = await page.evaluate(() => ({
    slots: document.querySelectorAll(".ptAd, ins.adsbygoogle").length,
    scripts: [...document.scripts].filter((s) =>
      /googlesyndication|fundingchoices|googletagmanager/.test(s.src),
    ).length,
    iframes: document.querySelectorAll("iframe").length,
    footer: document.querySelectorAll("[data-testid='ads-footer']").length,
    dataLayer: "dataLayer" in window,
    adsbygoogle: "adsbygoogle" in window,
    tcf: "__tcfapi" in window,
    classes: document.documentElement.className,
  }));
  expect(counts).toEqual({
    slots: 0,
    scripts: 0,
    iframes: 0,
    footer: 0,
    dataLayer: false,
    adsbygoogle: false,
    tcf: false,
    classes: expect.not.stringMatching(/ads/i) as unknown as string,
  });
}

/** visit every ad-eligible view: home, results, settings, about */
async function tour(page: Page, query = ""): Promise<void> {
  await openTest(page, `/${query}`);
  await expectNoAdDom(page);
  await finishTest(page);
  await page.waitForTimeout(500);
  await expectNoAdDom(page);
  for (const path of ["/settings", "/about", "/race"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoAdDom(page);
  }
}

/** smallest gap between each visible slot and any button, link or the typing area */
async function clearances(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const SELECTOR =
      "button, a[href], input, select, textarea:not(#wordsInput), #words, #wordsWrapper, #typingTest";
    const visible = (el: Element): DOMRect | null => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0) return null;
      if (style.visibility === "hidden") return null;
      return r;
    };
    const others = [...document.querySelectorAll(SELECTOR)]
      .filter((el) => el.closest(".ptAd") === null)
      .map(visible)
      .filter((r): r is DOMRect => r !== null);
    const out: Record<string, number> = {};
    for (const [i, ad] of [...document.querySelectorAll(".ptAd")].entries()) {
      const a = visible(ad);
      if (a === null) continue;
      let min = Infinity;
      for (const b of others) {
        const dx = Math.max(0, b.left - a.right, a.left - b.right);
        const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
        min = Math.min(min, Math.hypot(dx, dy));
      }
      out[`${(ad as HTMLElement).dataset["adKind"]}#${i}`] = Math.floor(min);
    }
    return out;
  });
}

async function expectClear(page: Page, kinds: string[]): Promise<void> {
  const gaps = await clearances(page);
  expect(
    Object.keys(gaps)
      .map((k) => k.split("#")[0])
      .sort(),
  ).toEqual([...kinds].sort());
  for (const [slot, gap] of Object.entries(gaps)) {
    expect(gap, `${slot} clearance`).toBeGreaterThanOrEqual(CLEARANCE_PX);
  }
}

const visibleSlots = (page: Page, kind?: string): Locator =>
  page.locator(
    kind === undefined
      ? ".ptAd:visible"
      : `.ptAd[data-ad-kind="${kind}"]:visible`,
  );

test.describe("ads off: default build", () => {
  test.skip(OFF_URL === undefined, "set ADS_OFF_URL");
  test.use({ baseURL: OFF_URL });

  test("no ad code, no /config.json, no ad requests, ?flags= can't enable", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const w = await watch(context);
    // even a server switch that says on changes nothing without the build flag
    await serveSwitch(context, true);
    await tour(page);
    await tour(page, "?flags=ads");
    await tour(
      page,
      "?flags=characterSelect,opponentDogs,openRooms,quickMatch,report",
    );
    expect(w.adRequests).toEqual([]);
    expect(w.configRequests).toEqual([]);
    expect(w.adChunks).toEqual([]);
  });
});

test.describe("ads off: ads build, server switch false", () => {
  test.skip(ADSENSE_URL === undefined, "set ADS_ADSENSE_URL");
  test.use({ baseURL: ADSENSE_URL });

  test("reads the switch, then loads nothing ad-related", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const w = await watch(context);
    await tour(page);
    await tour(page, "?flags=ads");
    expect(w.configRequests.length).toBeGreaterThan(0);
    expect(w.adRequests).toEqual([]);
    expect(w.adChunks).toEqual([]);
  });

  test("?flags=none wins over a switch that says on", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const w = await watch(context);
    await serveSwitch(context, true);
    await tour(page, "?flags=none");
    expect(w.configRequests).toEqual([]);
    expect(w.adRequests).toEqual([]);
    expect(w.adChunks).toEqual([]);
  });
});

test.describe("ads on: placeholder provider", () => {
  test.skip(PLACEHOLDER_URL === undefined, "set ADS_PLACEHOLDER_URL");
  test.use({ baseURL: PLACEHOLDER_URL });

  let w: Watch;
  test.beforeEach(async ({ context }) => {
    w = await watch(context);
    await serveSwitch(context, true);
    await context.addInitScript(() => {
      const shifts: { value: number; nodes: string[] }[] = [];
      (window as unknown as { __shifts: typeof shifts }).__shifts = shifts;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: { node?: Node }[];
        })[]) {
          if (entry.hadRecentInput) continue;
          shifts.push({
            value: entry.value,
            nodes: (entry.sources ?? []).map((s) =>
              s.node instanceof Element
                ? `${s.node.tagName}.${s.node.className}`
                : String(s.node?.nodeName),
            ),
          });
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
  });
  test.afterEach(() => {
    // placeholder mode makes no network requests to ad hosts, ever
    expect(w.adRequests).toEqual([]);
    expect(w.adChunks.every((c) => c.includes("placeholder"))).toBe(true);
  });

  test("1920: rails on idle and results only, hidden the instant typing starts", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openTest(page);
    await expect(visibleSlots(page, "rail")).toHaveCount(2);
    await expect(visibleSlots(page)).toHaveCount(2);
    await expect(page.locator(".ptAd-rail .ptAdBox").first()).toHaveText(
      /Ad placeholder 160×600/,
    );
    await expectClear(page, ["rail", "rail"]);
    for (const label of await page.locator(".ptAdLabel").allTextContents()) {
      expect(label).toBe("Advertisement");
    }

    // first keystroke: every slot is display:none within the same event
    // dispatch (window's bubbling listener runs after the engine's handler)
    await page.evaluate(() => {
      window.addEventListener(
        "input",
        () => {
          (window as unknown as { __atStart: string[] }).__atStart = [
            ...document.querySelectorAll(".ptAd"),
          ].map((el) => getComputedStyle(el).display);
        },
        { once: true },
      );
    });
    const first =
      (await page.locator("#words .word.active").textContent()) ?? "";
    await page.keyboard.type(first.slice(0, 1));
    expect(
      await page.evaluate(
        () => (window as unknown as { __atStart?: string[] }).__atStart,
      ),
    ).toEqual(["none", "none"]);
    await expect(visibleSlots(page)).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll(".ptAd")].map(
          (el) => getComputedStyle(el).display,
        ),
      ),
    ).toEqual(["none", "none"]);
    expect(
      await page.evaluate(() =>
        document.documentElement.classList.contains("adsSuppressed"),
      ),
    ).toBe(true);

    await finishTest(page);
    await expect(visibleSlots(page, "result")).toHaveCount(1);
    await expect(visibleSlots(page, "rail")).toHaveCount(2);
    await page.waitForTimeout(800);
    await expectClear(page, ["rail", "rail", "result"]);
    const box = page.locator(".ptAd-result .ptAdBox");
    expect(await box.boundingBox()).toMatchObject({ width: 728, height: 90 });
    await expect(box).toHaveText(/Ad placeholder 728×90/);

    // no layout shift caused by any slot
    const shifts = await page.evaluate(
      () =>
        (
          window as unknown as {
            __shifts: { value: number; nodes: string[] }[];
          }
        ).__shifts,
    );
    for (const shift of shifts) {
      expect(shift.nodes.join(" ")).not.toMatch(/ptAd/);
    }

    // next test: result slot gone; the rails stay (same ad, no refresh)
    const railText = await page.locator(".ptAd-rail").first().innerHTML();
    await page.getByRole("button", { name: "Next test" }).click();
    await expect(page.locator(".ptAd-result")).toHaveCount(0);
    await expect(visibleSlots(page, "rail")).toHaveCount(2);
    expect(await page.locator(".ptAd-rail").first().innerHTML()).toBe(railText);
  });

  test("1366: no rails; results unit below the stats", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1366, height: 768 });
    await openTest(page);
    await page.waitForTimeout(1000);
    await expect(page.locator(".ptAd-rail")).toHaveCount(0);
    await expect(visibleSlots(page)).toHaveCount(0);
    await finishTest(page);
    await expect(visibleSlots(page, "result")).toHaveCount(1);
    await expect(visibleSlots(page)).toHaveCount(1);
    await page.waitForTimeout(500);
    await expectClear(page, ["result"]);
    // below the stats and the buttons
    const stats = await page
      .locator('#result [data-ui-element="resultStat"]')
      .first()
      .boundingBox();
    const ad = await page.locator(".ptAd-result").boundingBox();
    expect(ad?.y ?? 0).toBeGreaterThan(stats?.y ?? Infinity);
  });

  test("390: small results unit, no rails", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openTest(page);
    await expect(page.locator(".ptAd-rail")).toHaveCount(0);
    await finishTest(page);
    await expect(visibleSlots(page, "result")).toHaveCount(1);
    const box = page.locator(".ptAd-result .ptAdBox");
    expect(await box.boundingBox()).toMatchObject({ width: 320, height: 100 });
  });

  test("settings and about get one unit; privacy and terms none", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1366, height: 900 });
    for (const path of ["/settings", "/about"]) {
      await page.goto(path);
      await expect(visibleSlots(page, "info")).toHaveCount(1);
      await expect(visibleSlots(page)).toHaveCount(1);
      await page.locator(".ptAd-info").scrollIntoViewIfNeeded();
      await expectClear(page, ["info"]);
    }
    for (const path of ["/privacy", "/terms"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".ptAd")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.querySelectorAll("script[src*='google'], ins").length,
        ),
      ).toBe(0);
    }
  });

  test("footer: privacy settings, Do Not Sell or Share, GPC honored", async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "globalPrivacyControl", { value: true });
    });
    await page.goto("/about");
    await expect(byTestId(page, "ads-privacy-settings")).toBeVisible();
    await expect(byTestId(page, "ads-do-not-sell")).toHaveText(
      "Do Not Sell or Share My Personal Information",
    );
    await expect(byTestId(page, "ads-do-not-sell")).toHaveAttribute(
      "href",
      /^\/privacy#/,
    );
    await expect(byTestId(page, "ads-opt-out-status")).toContainText(
      "you're opted out",
    );
    await expect(byTestId(page, "ads-gpc-honored")).toHaveText(
      /GPC signal honored/,
    );
  });

  test("?flags=none turns ads off; ?flags=<other> leaves them on", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/about?flags=none");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".ptAd")).toHaveCount(0);
    // the kill switch sticks for the tab
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".ptAd")).toHaveCount(0);
    await page.goto("/about?flags=default");
    await expect(visibleSlots(page, "info")).toHaveCount(1);
  });

  test("Quick Match search card gets a unit (mocked server)", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await context.addInitScript(
      (key) => localStorage.setItem(key, "true"),
      AGE_KEY,
    );
    await page.routeWebSocket(/\/ws$/, (ws) => {
      ws.onMessage((raw) => {
        const msg = JSON.parse(String(raw)) as { type: string; t?: number };
        const send = (m: unknown): void => ws.send(JSON.stringify(m));
        if (msg.type === "hello") {
          send({
            type: "welcome",
            playerId: "p1",
            sessionToken: "t",
            name: "ZippyPug42",
            protocol: 1,
            features: {
              characterSelect: false,
              openRooms: false,
              quickMatch: true,
              report: false,
            },
          });
        } else if (msg.type === "ping") {
          send({ type: "pong", t: msg.t, serverNow: Date.now() });
        } else if (msg.type === "queue:join") {
          send({
            type: "queue:status",
            band: "40–60 wpm",
            widenedTo: "40–60 wpm",
            waitedMs: 0,
          });
        }
      });
    });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/race");
    await expect(byTestId(page, "mp-quick-match")).toBeVisible({
      timeout: 60_000,
    });
    // no unit on the hub itself
    await expect(page.locator(".ptAd")).toHaveCount(0);
    await byTestId(page, "mp-public").click();
    await expect(byTestId(page, "mp-queue")).toBeVisible();
    await expect(visibleSlots(page, "lobby")).toHaveCount(1);
    await expect(visibleSlots(page)).toHaveCount(1);
    const card = await byTestId(page, "mp-queue").boundingBox();
    const ad = await page.locator(".ptAd-lobby").boundingBox();
    expect(ad?.y ?? 0).toBeGreaterThan((card?.y ?? 0) + (card?.height ?? 0));
    await expectClear(page, ["lobby"]);
  });

  test("lobby unit; nothing during countdown and race; results unit after", async ({
    page,
    context,
    browser,
  }) => {
    test.setTimeout(240_000);
    await context.addInitScript(
      (key) => localStorage.setItem(key, "true"),
      AGE_KEY,
    );
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/race");
    await expect(byTestId(page, "race-page")).toBeVisible({ timeout: 60_000 });
    const create = byTestId(page, "mp-create");
    try {
      await expect(create).toBeVisible({ timeout: 15_000 });
    } catch {
      test.skip(true, "WS server not reachable through /ws");
    }
    await expect(page.locator(".ptAd")).toHaveCount(0);
    await create.click();
    await expect(byTestId(page, "mp-lobby")).toBeVisible();
    await byTestId(page, "mp-mode-words").click();
    await byTestId(page, "mp-length-10").click();
    await expect(visibleSlots(page, "lobby")).toHaveCount(1);
    await expect(visibleSlots(page)).toHaveCount(1);
    const lobby = await byTestId(page, "mp-lobby").boundingBox();
    const ad = await page.locator(".ptAd-lobby").boundingBox();
    expect(ad?.y ?? 0).toBeGreaterThan((lobby?.y ?? 0) + (lobby?.height ?? 0));
    await expectClear(page, ["lobby"]);

    // a second typist joins and readies up
    const code = (await byTestId(page, "mp-room-code").innerText()).trim();
    const ctxB = await browser.newContext();
    await skipNgrokWarning(ctxB);
    await ctxB.addInitScript(
      (key) => localStorage.setItem(key, "true"),
      AGE_KEY,
    );
    await serveSwitch(ctxB, true);
    const b = await ctxB.newPage();
    await b.goto(`/r/${code}`);
    await expect(byTestId(b, "mp-lobby")).toBeVisible({ timeout: 60_000 });
    await byTestId(b, "mp-ready").click();

    const start = byTestId(page, "mp-start");
    await expect(start).toBeEnabled({ timeout: 10_000 });
    await start.click();
    await expect(byTestId(page, "mp-countdown")).toBeVisible();
    await expect(visibleSlots(page)).toHaveCount(0);
    expect(await page.locator("ins.adsbygoogle, .ptAd:visible").count()).toBe(
      0,
    );
    await expect(byTestId(page, "mp-countdown")).toBeHidden({
      timeout: 10_000,
    });
    // racing: both type, B slower
    const words = await page.$$eval("#words .word", (els) =>
      els.map((el) =>
        [...el.querySelectorAll("letter")].map((l) => l.textContent).join(""),
      ),
    );
    const typeAll = async (p: Page, delay: number): Promise<void> => {
      for (const [i, word] of words.entries()) {
        await p.keyboard.type(i === words.length - 1 ? word : `${word} `, {
          delay,
        });
      }
    };
    const typing = Promise.all([typeAll(page, 20), typeAll(b, 40)]);
    await expect(page.locator("#words letter.correct").first()).toBeVisible();
    await expect(visibleSlots(page)).toHaveCount(0);
    await expect(visibleSlots(b)).toHaveCount(0);
    await typing;
    await expect(byTestId(page, "mp-podium")).toBeVisible({ timeout: 30_000 });
    await expect(visibleSlots(page, "result")).toHaveCount(1);
    await expect(visibleSlots(page, "lobby")).toHaveCount(0);
    await page.locator(".ptAd-result").scrollIntoViewIfNeeded();
    await expectClear(page, ["result"]);
    await ctxB.close();
  });
});
