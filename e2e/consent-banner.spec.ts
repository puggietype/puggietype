import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

const GA_REQUEST = /google-analytics|googletagmanager|analytics\.google/i;

const ESSENTIAL =
  "Optional Google Analytics 4 measures site use. It loads only if you accept; rejecting keeps it off.";

function watchGa(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (request) => {
    if (GA_REQUEST.test(request.url())) hits.push(request.url());
  });
  return hits;
}

async function expectEssentialVisible(
  page: Page,
  selector: string,
  width: number,
  height: number,
): Promise<void> {
  const reading = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!(el instanceof HTMLElement)) return null;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
      lineClamp: style.getPropertyValue("-webkit-line-clamp"),
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      hostTop:
        el.closest("#CookiesModal, #pt-consent-banner")?.getBoundingClientRect()
          .top ?? rect.top,
      hostBottom:
        el.closest("#CookiesModal, #pt-consent-banner")?.getBoundingClientRect()
          .bottom ?? rect.bottom,
    };
  }, selector);
  expect(reading, selector).not.toBeNull();
  if (reading === null) return;
  expect(reading.text, selector).toContain(ESSENTIAL);
  expect(reading.text, selector).toContain("Privacy policy");
  expect(reading.textOverflow, selector).not.toBe("ellipsis");
  expect(reading.whiteSpace, selector).not.toBe("nowrap");
  expect(reading.overflowX, selector).not.toBe("hidden");
  expect(reading.overflowY, selector).not.toBe("hidden");
  expect(["", "none"]).toContain(reading.lineClamp);
  expect(reading.scrollW, selector).toBeLessThanOrEqual(reading.clientW + 1);
  expect(reading.scrollH, selector).toBeLessThanOrEqual(reading.clientH + 1);
  expect(reading.top, selector).toBeGreaterThanOrEqual(0);
  expect(reading.left, selector).toBeGreaterThanOrEqual(0);
  expect(reading.right, selector).toBeLessThanOrEqual(width + 1);
  expect(reading.bottom, selector).toBeLessThanOrEqual(height + 1);
  expect(reading.top, selector).toBeGreaterThanOrEqual(reading.hostTop - 1);
  expect(reading.bottom, selector).toBeLessThanOrEqual(reading.hostBottom + 1);
}

async function abortGa(page: Page): Promise<void> {
  await page.route(GA_REQUEST, async (route) => {
    await route.abort();
  });
}

test.use({ viewport: { width: 1280, height: 720 } });

test.beforeEach(async ({ context }) => {
  await skipNgrokWarning(context);
});

type WordFit = {
  total: number;
  shown: number;
  lines: number;
  covered: number;
  overflowY: string;
  barHeight: number;
  barWidth: number;
};

async function wordFit(page: Page): Promise<WordFit> {
  return page.evaluate((): WordFit => {
    const wrap = document.querySelector("#wordsWrapper");
    const banner = document.getElementById("CookiesModal");
    const words = [...document.querySelectorAll("#words .word")];
    const wrapBox =
      wrap instanceof HTMLElement ? wrap.getBoundingClientRect() : null;
    const open =
      banner instanceof HTMLElement &&
      getComputedStyle(banner).display !== "none" &&
      banner.getBoundingClientRect().height > 0;
    const bar =
      open && banner instanceof HTMLElement
        ? banner.getBoundingClientRect()
        : null;
    let shown = 0;
    let covered = 0;
    const lineTops = new Set<number>();
    for (const node of words) {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || wrapBox === null) continue;
      const fullyShown =
        rect.top >= wrapBox.top - 1 &&
        rect.bottom <= wrapBox.bottom + 1 &&
        rect.left >= wrapBox.left - 1 &&
        rect.right <= wrapBox.right + 1;
      if (fullyShown) {
        shown += 1;
        lineTops.add(Math.round(rect.top / 4));
      }
      if (
        bar !== null &&
        rect.bottom > bar.top + 0.5 &&
        rect.top < bar.bottom &&
        rect.bottom > wrapBox.top &&
        rect.top < wrapBox.bottom
      ) {
        covered += 1;
      }
    }
    return {
      total: words.length,
      shown,
      lines: lineTops.size,
      covered,
      overflowY: wrap === null ? "" : getComputedStyle(wrap).overflowY,
      barHeight: bar?.height ?? 0,
      barWidth: bar?.width ?? 0,
    };
  });
}

const VIEWPORTS: Array<[number, number]> = [
  [1280, 720],
  [1280, 600],
  [1024, 768],
  [390, 844],
  [320, 700],
];

test("the banner leaves the full word list usable", async ({
  page,
}, testInfo) => {
  const ga = watchGa(page);
  await abortGa(page);

  const bare = await page.context().browser()?.newContext();
  if (bare === undefined) throw new Error("no browser");
  const plain = await bare.newPage();
  await plain.addInitScript(() => {
    localStorage.setItem(
      "acceptedCookies",
      JSON.stringify({
        security: true,
        analytics: false,
        doNotSellOrShare: true,
      }),
    );
  });

  for (const [width, height] of VIEWPORTS) {
    await plain.setViewportSize({ width, height });
    await plain.goto("/");
    await plain.locator("#words .word").first().waitFor({ timeout: 60_000 });
    const before = await wordFit(plain);

    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
    await expect(page.locator("#consent-accept")).toBeVisible();
    const after = await wordFit(page);
    expect(after.total, `${width}x${height} word count`).toBe(before.total);
    expect(after.lines, `${width}x${height} visible lines`).toBe(before.lines);
    expect(after.shown, `${width}x${height} visible words`).toBeGreaterThan(0);
    expect(after.covered, `${width}x${height} covered`).toBe(0);
    expect(after.overflowY, `${width}x${height}`).toBe(before.overflowY);
    expect(after.barHeight).toBeGreaterThan(24);
    expect(after.barHeight).toBeLessThan(320);
    await expectEssentialVisible(page, "#consent-copy", width, height);
    expect(after.barWidth).toBeGreaterThan(width * 0.9);
    for (const id of ["#consent-accept", "#consent-reject"]) {
      const box = await page.locator(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box?.x ?? 0, id).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0), id).toBeLessThanOrEqual(
        width + 1,
      );
    }
  }

  await page.setViewportSize({ width: 1280, height: 500 });
  await page.waitForTimeout(200);
  await expectEssentialVisible(page, "#consent-copy", 1280, 500);
  const resized = await wordFit(page);
  expect(resized.covered, "resized").toBe(0);
  expect(resized.shown, "resized").toBeGreaterThan(0);
  expect(resized.total).toBeGreaterThan(resized.shown);
  await bare.close();

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator("#consent-accept").waitFor();
  expect(ga).toEqual([]);

  const shot = testInfo.outputPath("consent-banner-1280x720.png");
  await page.screenshot({ path: shot });
  await testInfo.attach("consent-banner-1280x720", {
    path: shot,
    contentType: "image/png",
  });

  const axe = await new AxeBuilder({ page }).include("#CookiesModal").analyze();
  expect(
    axe.violations
      .filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      )
      .map((violation) => violation.id),
  ).toEqual([]);

  const input = page.locator("#wordsInput");
  await input.focus();
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
  await page.keyboard.press("Escape");
  await expect(page.locator("#CommandlineModal")).toBeVisible();
  expect(ga).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(page.locator("#CommandlineModal")).toBeHidden();
  const word = (await page.locator("#words .word").first().textContent()) ?? "";
  await input.focus();
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
  await expect(banner).toBeFocused();
  await expect(buttons.nth(0)).not.toBeFocused();
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

test("static essential disclosure stays fully readable", async ({ page }) => {
  await abortGa(page);
  for (const [width, height] of [
    [320, 700],
    [390, 844],
    [1280, 600],
    [1280, 500],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/privacy");
    await page.locator("#pt-consent-copy").waitFor();
    await expectEssentialVisible(page, "#pt-consent-copy", width, height);
    const buttons = page.locator("#pt-consent-banner .consentActions button");
    const accept = await buttons.nth(0).boundingBox();
    const reject = await buttons.nth(1).boundingBox();
    expect(Math.abs((accept?.width ?? 0) - (reject?.width ?? 0))).toBeLessThan(
      2,
    );
    expect((accept?.x ?? 0) + (accept?.width ?? 0)).toBeLessThanOrEqual(
      width + 1,
    );
    expect((reject?.x ?? 0) + (reject?.width ?? 0)).toBeLessThanOrEqual(
      width + 1,
    );
  }
});

async function storedConsent(
  page: Page,
): Promise<{ analytics?: boolean; doNotSellOrShare?: boolean } | null> {
  const raw = await page.evaluate(
    () => localStorage.getItem("acceptedCookies") ?? "",
  );
  if (raw === "") return null;
  return JSON.parse(raw) as { analytics?: boolean; doNotSellOrShare?: boolean };
}

function expectNotOptedIn(
  record: { analytics?: boolean; doNotSellOrShare?: boolean } | null,
): void {
  expect(record?.analytics).not.toBe(true);
}

test("a fresh load keeps typing focus, and Space or Enter does not opt in", async ({
  page,
}) => {
  const ga = watchGa(page);
  await abortGa(page);
  await page.goto("/");
  await page.locator("#consent-copy").waitFor();
  await page.locator("#wordsInput").waitFor();
  await page.waitForTimeout(700);
  await expect
    .poll(async () => page.evaluate(() => document.activeElement?.id ?? ""))
    .toBe("wordsInput");
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await page.keyboard.type("the ");
  expectNotOptedIn(await storedConsent(page));
  expect(ga).toEqual([]);
  expect(await page.locator("script[src*='googletagmanager']").count()).toBe(0);

  await page.goto("/");
  await page.locator("#consent-copy").waitFor();
  await page.locator("#wordsInput").waitFor();
  await page.waitForTimeout(400);
  await expect
    .poll(async () => page.evaluate(() => document.activeElement?.id ?? ""))
    .toBe("wordsInput");
  await page.keyboard.press("Escape");
  await expect(page.locator("#CookiesModal")).toBeHidden();
  expect(await storedConsent(page)).toMatchObject({
    analytics: false,
    doNotSellOrShare: true,
  });
  await page.getByTestId("privacy-cookie-settings").click();
  await expect(page.locator("#consent-accept")).toBeVisible();
  await page.waitForTimeout(400);
  const reopened = await page.evaluate(
    () => document.activeElement?.id ?? document.activeElement?.tagName ?? "",
  );
  expect(reopened).not.toBe("consent-accept");
  expect(reopened).not.toBe("CookiesModal");
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  expect(await storedConsent(page)).toMatchObject({
    analytics: false,
    doNotSellOrShare: true,
  });
  expect(ga).toEqual([]);
});

test("static natural load and footer reopen do not opt in from Space or Enter", async ({
  page,
}) => {
  const ga = watchGa(page);
  await abortGa(page);
  await page.goto("/privacy");
  await page.locator("#pt-consent-copy").waitFor();
  await page.waitForTimeout(500);
  const focusedAccept = await page.evaluate(() => {
    const active = document.activeElement;
    return (
      active instanceof HTMLElement &&
      active.closest("#pt-consent-banner") !== null &&
      active.tagName === "BUTTON" &&
      (active.textContent ?? "").includes("Accept")
    );
  });
  expect(focusedAccept).toBe(false);
  await expect
    .poll(async () => page.evaluate(() => document.activeElement?.id ?? ""))
    .toBe("pt-consent-banner");
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  expectNotOptedIn(await storedConsent(page));
  expect(ga).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(page.locator("#pt-consent-banner")).toHaveCount(0);
  expect(await storedConsent(page)).toMatchObject({
    analytics: false,
    doNotSellOrShare: true,
  });
  await page.locator("[data-consent-settings]").click();
  await expect(page.locator("#pt-consent-banner")).toBeVisible();
  await page.waitForTimeout(300);
  const reopenedAccept = await page.evaluate(() => {
    const active = document.activeElement;
    return (
      active instanceof HTMLButtonElement &&
      (active.textContent ?? "").includes("Accept")
    );
  });
  expect(reopenedAccept).toBe(false);
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  expect(await storedConsent(page)).toMatchObject({
    analytics: false,
    doNotSellOrShare: true,
  });
  expect(ga).toEqual([]);
});

test("a deliberate Accept still saves analytics on", async ({ page }) => {
  await abortGa(page);
  await page.goto("/");
  await page.locator("#consent-accept").waitFor();
  await page.waitForTimeout(400);
  await page.locator("#consent-accept").click();
  expect(await storedConsent(page)).toMatchObject({ analytics: true });

  await page.evaluate(() => localStorage.clear());
  await page.goto("/privacy");
  await page.locator("#pt-consent-banner").waitFor();
  await page.waitForTimeout(300);
  await page
    .locator("#pt-consent-banner .consentActions button")
    .first()
    .click();
  expect(await storedConsent(page)).toMatchObject({ analytics: true });

  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.locator("#wordsInput").waitFor();
  await page.waitForTimeout(500);
  let reachedAccept = false;
  for (let step = 0; step < 40; step++) {
    const id = await page.evaluate(() => document.activeElement?.id ?? "");
    if (id === "consent-accept") {
      reachedAccept = true;
      break;
    }
    await page.keyboard.press("Tab");
  }
  expect(reachedAccept).toBe(true);
  await page.keyboard.press("Enter");
  expect(await storedConsent(page)).toMatchObject({ analytics: true });
});

async function expectControlsReachable(
  page: Page,
  selectors: string[],
): Promise<void> {
  const result = await page.evaluate((sels) => {
    const viewH = window.visualViewport?.height ?? window.innerHeight;
    const viewW = window.innerWidth;
    const failures: string[] = [];
    for (const sel of sels) {
      const nodes = [...document.querySelectorAll(sel)];
      if (nodes.length === 0) {
        failures.push(`${sel} missing`);
        continue;
      }
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
        const rect = node.getBoundingClientRect();
        const place = `${sel} top=${Math.round(rect.top)} bottom=${Math.round(rect.bottom)} left=${Math.round(rect.left)} right=${Math.round(rect.right)} view=${Math.round(viewH)}x${Math.round(viewW)}`;
        if (rect.width <= 0 || rect.height <= 0) {
          failures.push(`${place} empty`);
        }
        const fitsHeight = rect.height <= viewH + 1;
        const fitsWidth = rect.width <= viewW + 1;
        const seen =
          rect.bottom > 1 &&
          rect.top < viewH - 1 &&
          rect.right > 1 &&
          rect.left < viewW - 1;
        if (fitsHeight && (rect.top < -1 || rect.bottom > viewH + 1)) {
          failures.push(place);
        } else if (!fitsHeight && !seen) {
          failures.push(`${place} off`);
        }
        if (fitsWidth && (rect.left < -1 || rect.right > viewW + 1)) {
          failures.push(`${place} x`);
        } else if (!fitsWidth && !seen) {
          failures.push(`${place} x-off`);
        }
      }
    }
    const host = document.querySelector("#CookiesModal, #pt-consent-banner");
    return {
      failures,
      hostTop:
        host instanceof HTMLElement ? host.getBoundingClientRect().top : null,
    };
  }, selectors);
  expect(result.failures).toEqual([]);
  expect(result.hostTop ?? 0).toBeGreaterThanOrEqual(-1);
}

test("details and the disclosure stay reachable at zoomed 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.locator("#consent-copy").waitFor();
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(200);
  await expectControlsReachable(page, [
    "#consent-copy",
    "#consent-accept",
    "#consent-reject",
  ]);
  const described = await page.evaluate(() => {
    const dialog = document.getElementById("CookiesModal");
    const id = dialog?.getAttribute("aria-describedby") ?? "";
    const copy = document.getElementById("consent-copy");
    return id !== "" && copy !== null && dialog?.contains(copy) === true;
  });
  expect(described).toBe(true);
  await page.evaluate(() => {
    const more = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "more options",
    );
    if (!(more instanceof HTMLElement)) {
      return;
    }
    more.scrollIntoView({ block: "nearest" });
    more.click();
  });
  await expect(page.locator("#consent-copy")).toBeAttached();
  await expectControlsReachable(page, [
    "#consent-copy",
    "#CookiesModal input[type='checkbox']",
    "#consent-save",
  ]);

  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
  await page.setViewportSize({ width: 160, height: 350 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(200);
  await expectControlsReachable(page, [
    "#consent-copy",
    "#CookiesModal input[type='checkbox']",
    "#consent-save",
  ]);

  const session = await page.context().newCDPSession(page);
  let browserZoom = "unavailable";
  try {
    await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    browserZoom = "Emulation.setPageScaleFactor";
  } catch (error) {
    browserZoom = error instanceof Error ? error.message : "cdp failed";
  }
  expect(browserZoom.length).toBeGreaterThan(0);
  if (browserZoom === "Emulation.setPageScaleFactor") {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForTimeout(200);
    await expectControlsReachable(page, [
      "#consent-copy",
      "#CookiesModal input[type='checkbox']",
      "#consent-save",
    ]);
  }
});

test("more options keeps the disclosure and can reach save at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.locator("#consent-copy").waitFor();
  await expectEssentialVisible(page, "#consent-copy", 320, 700);
  await page.getByRole("button", { name: "more options" }).click();
  await expect(page.locator("#consent-copy")).toBeAttached();
  const described = await page.evaluate(() => {
    const dialog = document.getElementById("CookiesModal");
    const id = dialog?.getAttribute("aria-describedby") ?? "";
    return id !== "" && document.getElementById(id) !== null;
  });
  expect(described).toBe(true);
  const save = page.locator("#consent-save");
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await page.setViewportSize({ width: 320, height: 500 });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await page.locator("#CookiesModal").evaluate((el) => {
    el.scrollTop = 0;
  });
  await expectEssentialVisible(page, "#consent-copy", 320, 500);
});

const RACE_VIEWPORTS: Array<[number, number]> = [
  [1280, 720],
  [1280, 600],
  [1280, 500],
  [1024, 768],
  [390, 844],
  [320, 700],
];

async function installRaceFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const frames: string[] = [];
    Object.assign(window, { __mpFrames: frames });
    localStorage.setItem("puggie-mp-age-confirmed", "true");
    sessionStorage.removeItem("puggie-mp-room");
    const Native = WebSocket;
    const progress = {
      wordIndex: 0,
      charIndex: 0,
      testMs: 0,
      wpm: 0,
    };
    const settings = {
      mode: "time",
      mode2: 30,
      punctuation: false,
      numbers: false,
      language: "english",
    };
    const player = (id: string, name: string, ready: boolean): object => ({
      id,
      name,
      isBot: false,
      color: "opp1",
      ready,
      inLobby: false,
      connected: true,
      character: "puggie",
      progress,
      finished: false,
    });
    const room = (count: number): object => ({
      type: "room:state",
      code: "ABCD2345",
      hostId: "p1",
      phase: "lobby",
      settings,
      settingsVersion: 1,
      open: false,
      quickMatch: false,
      players: [
        player("p1", "Host Pug", true),
        ...Array.from({ length: count - 1 }, (_, index) =>
          player(`p${index + 2}`, `Pug ${index + 2}`, true),
        ),
      ],
    });

    class FakeSocket {
      url: string;
      readyState = 0;
      private listeners: Record<string, Array<(event: unknown) => void>> = {};

      constructor(url: string) {
        this.url = url;
        setTimeout(() => {
          this.readyState = 1;
          this.emit("open", {});
        }, 0);
      }

      addEventListener(type: string, fn: (event: unknown) => void): void {
        (this.listeners[type] ??= []).push(fn);
      }

      removeEventListener(type: string, fn: (event: unknown) => void): void {
        this.listeners[type] = (this.listeners[type] ?? []).filter(
          (listener) => listener !== fn,
        );
      }

      send(raw: string): void {
        const msg = JSON.parse(raw) as { type?: string; t?: number };
        if (msg.type !== undefined) frames.push(msg.type);
        if (msg.type === "ping") {
          this.emit("message", {
            data: JSON.stringify({
              type: "pong",
              t: msg.t,
              serverNow: Date.now(),
            }),
          });
        }
        if (msg.type === "hello") {
          this.emit("message", {
            data: JSON.stringify({
              type: "welcome",
              playerId: "p1",
              sessionToken: "local-fixture",
              name: "Host Pug",
              protocol: 1,
              features: {
                characterSelect: false,
                openRooms: false,
                quickMatch: false,
                report: false,
              },
            }),
          });
        }
        if (msg.type === "room:create") {
          const fixtureMode = new URLSearchParams(location.search).get(
            "mpFixture",
          );
          const count = fixtureMode === "full" ? 8 : 2;
          this.emit("message", { data: JSON.stringify(room(count)) });
        }
      }

      close(): void {
        this.readyState = 3;
        this.emit("close", { code: 1000 });
      }

      private emit(type: string, event: unknown): void {
        for (const listener of this.listeners[type] ?? []) listener(event);
      }
    }
    Object.assign(FakeSocket, {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
    });

    function SocketShim(url: string | URL): WebSocket {
      if (!String(url).includes("/ws")) return new Native(url);
      return new FakeSocket(String(url)) as unknown as WebSocket;
    }
    SocketShim.CONNECTING = 0;
    SocketShim.OPEN = 1;
    SocketShim.CLOSING = 2;
    SocketShim.CLOSED = 3;
    window.WebSocket = SocketShim as unknown as typeof WebSocket;
  });
}

async function raceFrames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const frames = (window as unknown as { __mpFrames?: string[] }).__mpFrames;
    return frames ?? [];
  });
}

async function assertHitClear(
  page: Page,
  control: Locator,
  testId: string,
): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  await control.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "nearest" });
  });
  const box = await control.boundingBox();
  const bar = await page.locator("#CookiesModal .modal").boundingBox();
  if (box === null || bar === null) {
    throw new Error(`${testId} or banner box missing`);
  }
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1);
  const enabled = await control.isEnabled();
  const hit = await page.evaluate(
    ({ testId: id, x, y, bottom }) => {
      const at = (pointY: number): string => {
        const el = document.elementFromPoint(x, pointY);
        if (!(el instanceof Element)) return "";
        if (el.closest("#CookiesModal") !== null) return "banner";
        return el.closest(`[data-testid="${id}"]`) === null ? "other" : id;
      };
      return { center: at(y), bottom: at(bottom) };
    },
    {
      testId,
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      bottom: Math.min(box.y + box.height - 2, bar.y - 1),
    },
  );
  if (enabled) {
    expect(hit.center).toBe(testId);
    expect(hit.bottom).toBe(testId);
    return;
  }
  expect(hit.center).not.toBe("banner");
  expect(hit.bottom).not.toBe("banner");
}

test("race controls stay clickable above the banner", async ({ page }) => {
  await abortGa(page);
  await installRaceFixture(page);
  test.setTimeout(120_000);
  for (const [width, height] of RACE_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto("/race?mpFixture=home");
    await page.getByTestId("mp-create").waitFor();
    await expect(page.locator("#CookiesModal")).toBeVisible();
    await assertHitClear(page, page.getByTestId("mp-create"), "mp-create");
    await assertHitClear(page, page.getByTestId("mp-join"), "mp-join");
    await page.getByTestId("mp-create").click();
    await expect.poll(async () => raceFrames(page)).toContain("room:create");
    expectNotOptedIn(await storedConsent(page));
    expect(await page.locator("script[src*='googletagmanager']").count()).toBe(
      0,
    );
  }
});

test("a lobby and a full lobby stay usable without consent", async ({
  page,
}) => {
  await abortGa(page);
  await installRaceFixture(page);
  test.setTimeout(120_000);
  for (const mode of ["lobby", "full"] as const) {
    for (const [width, height] of RACE_VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await page.goto(`/race?mpFixture=${mode}`);
      await page.getByTestId("mp-create").waitFor();
      await assertHitClear(page, page.getByTestId("mp-create"), "mp-create");
      await page.getByTestId("mp-create").click();
      const start = page.getByTestId("mp-start");
      await expect(start).toBeEnabled();
      await expect(page.getByTestId("mp-player")).toHaveCount(
        mode === "full" ? 8 : 2,
      );
      for (const id of ["mp-copy-invite", "mp-leave", "mp-start"]) {
        await assertHitClear(page, page.getByTestId(id), id);
      }
      const players = page.getByTestId("mp-player");
      const playerCount = await players.count();
      for (let index = 0; index < playerCount; index++) {
        await assertHitClear(page, players.nth(index), "mp-player");
      }
      await start.click();
      await expect.poll(async () => raceFrames(page)).toContain("race:start");
      expectNotOptedIn(await storedConsent(page));
    }
  }
});

test("keyboard reaches Create without opting in", async ({ page }) => {
  await abortGa(page);
  await page.setViewportSize({ width: 1280, height: 500 });
  await installRaceFixture(page);
  await page.goto("/race?mpFixture=home");
  await page.getByTestId("mp-create").waitFor();
  let reached = false;
  for (let step = 0; step < 40; step++) {
    const id = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") ?? "",
    );
    if (id === "mp-create") {
      reached = true;
      break;
    }
    await page.keyboard.press("Tab");
  }
  expect(reached).toBe(true);
  await page.keyboard.press("Enter");
  await expect.poll(async () => raceFrames(page)).toContain("room:create");
  expectNotOptedIn(await storedConsent(page));
});

test("zoomed race Create stays above the banner", async ({ page }) => {
  await abortGa(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await installRaceFixture(page);
  await page.goto("/race?mpFixture=home");
  await page.getByTestId("mp-create").waitFor();
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(200);
  await assertHitClear(page, page.getByTestId("mp-create"), "mp-create");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
  await page.setViewportSize({ width: 160, height: 350 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(200);
  await assertHitClear(page, page.getByTestId("mp-create"), "mp-create");
});
