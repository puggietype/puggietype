import { mkdirSync } from "node:fs";

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  byTestId,
  dismissBanner,
  GUEST,
  GUEST_NAME,
  maxFillChroma,
  ME,
  ME_NAME,
  mockServer,
  openLobby,
  RESULTS,
  type Mock,
} from "./mock-room";

// Strict quick-chat bubbles + full-colour dogs across themes, /ws mocked (page.routeWebSocket):
// no real server, no rooms. Folds in QA M03-B: the contrast sweep runs in mono themes too
// (serika_dark, serika, nord), not just the default puggie_dark.
const SCREENS = process.env["SCREENS_DIR"] ?? "e2e/screens";
mkdirSync(SCREENS, { recursive: true });

/** [theme, mono pug?] */
const THEMES = [
  ["serika_dark", true],
  ["puggie_dark", false],
  ["serika", true],
  ["nord", true],
] as const;

const FEATURES = { quickChat: true, characterSelect: true };

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const bubbleOf = (row: Locator): Locator =>
  row.locator('[data-testid="mp-quickchat-bubble"]');
const lobbyRow = (page: Page, id: string): Locator =>
  page.locator(`[data-testid="mp-player"][data-player-id="${id}"]`);
const resultRow = (page: Page, id: string): Locator =>
  page.locator(`[data-testid="mp-result-row"][data-player-id="${id}"]`);

/** bubble right after the name in DOM order, no overlap with the name or any control in its row */
async function expectPlacement(
  row: Locator,
  name: Locator,
  presetId: string,
): Promise<void> {
  const bubble = bubbleOf(row);
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toHaveAttribute("data-preset-id", presetId);
  await expect(bubble).toHaveAttribute("aria-hidden", "true");
  expect(
    await bubble.evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe("none");
  expect(
    await name.evaluate(
      (n, b) => n.nextElementSibling === b,
      await bubble.elementHandle(),
    ),
    "bubble is the next sibling of the name",
  ).toBe(true);
  const bb = await bubble.boundingBox();
  const nb = await name.boundingBox();
  expect(bb).not.toBeNull();
  expect(nb).not.toBeNull();
  expect(intersects(bb as Box, nb as Box), "bubble vs name").toBe(false);
  const controls = row.locator(
    'button, [role="button"], [data-testid="mp-host-crown"], [data-testid^="mp-ready"], [data-testid="mp-quickchat-muted-chip"]',
  );
  for (const c of await controls.all()) {
    if (!(await c.isVisible())) continue;
    const cb = await c.boundingBox();
    if (cb === null) continue;
    const label =
      (await c.getAttribute("data-testid")) ?? (await c.textContent());
    expect(intersects(bb as Box, cb), `bubble vs ${label}`).toBe(false);
  }
  // nothing pushed out of the viewport
  const vw = row.page().viewportSize()?.width ?? 0;
  for (const c of await controls.all()) {
    if (!(await c.isVisible())) continue;
    const cb = await c.boundingBox();
    if (cb !== null) expect(cb.x + cb.width).toBeLessThanOrEqual(vw + 0.5);
  }
}

/** WCAG ratio of every visible own-text element under `selector` (alpha-composited) */
async function measureText(
  p: Page,
  selector: string,
): Promise<{ text: string; ratio: number }[]> {
  return p.evaluate((sel) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    if (cx === null) throw new Error("no 2d context");
    type Rgba = [number, number, number, number];
    const rgba = (c: string): Rgba => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = "#000";
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
    };
    const over = (f: Rgba, b: Rgba): Rgba =>
      [
        ...([0, 1, 2] as const).map((i) => f[i] * f[3] + b[i] * (1 - f[3])),
        1,
      ] as Rgba;
    const lum = (c: Rgba): number => {
      const [r, g, b] = ([0, 1, 2] as const).map((i) => {
        const v = c[i] / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
    };
    const ratio = (a: Rgba, b: Rgba): number => {
      const hi = Math.max(lum(a), lum(b));
      const lo = Math.min(lum(a), lum(b));
      return (hi + 0.05) / (lo + 0.05);
    };
    const bgOf = (el: Element): Rgba => {
      const layers: Rgba[] = [];
      for (let n: Element | null = el; n !== null; n = n.parentElement) {
        const c = rgba(getComputedStyle(n).backgroundColor);
        if (c[3] > 0) {
          layers.push(c);
          if (c[3] === 1) break;
        }
      }
      let b: Rgba = [0, 0, 0, 1];
      if (layers.length > 0 && layers[layers.length - 1]?.[3] === 1) {
        b = layers.pop() as Rgba;
      }
      for (let i = layers.length - 1; i >= 0; i--) {
        b = over(layers[i] as Rgba, b);
      }
      return b;
    };
    const opacityOf = (el: Element): number => {
      let o = 1;
      for (let n: Element | null = el; n !== null; n = n.parentElement) {
        o *= Number(getComputedStyle(n).opacity);
      }
      return o;
    };
    const out: { text: string; ratio: number }[] = [];
    for (const root of document.querySelectorAll(sel)) {
      for (const e of [root, ...root.querySelectorAll("*")]) {
        const own = [...e.childNodes].some(
          (c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== "",
        );
        if (!own) continue;
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // faded (disabled/cooldown) controls are exempt from 1.4.3
        if (opacityOf(e) < 1) continue;
        const fg = over(rgba(getComputedStyle(e).color), bgOf(e));
        out.push({
          text: (e.textContent ?? "").trim().slice(0, 28),
          ratio: ratio(fg, bgOf(e)),
        });
      }
    }
    return out;
  }, selector);
}

/** count of non-empty texts the live region takes on (installed once per page) */
async function watchLive(p: Page): Promise<void> {
  await byTestId(p, "mp-quickchat-live").evaluate((live) => {
    const w = window as unknown as { __qcSaid: string[] };
    w.__qcSaid = [];
    new MutationObserver(() => {
      const t = live.textContent ?? "";
      if (t !== "") w.__qcSaid.push(t);
    }).observe(live, { childList: true, characterData: true, subtree: true });
  });
}
async function said(p: Page): Promise<string[]> {
  return p.evaluate(
    () => (window as unknown as { __qcSaid: string[] }).__qcSaid,
  );
}

type AxeFinding = { id: string; target: string };
async function axeFindings(p: Page): Promise<AxeFinding[]> {
  // no mid-transition colour reads (flaky contrast results otherwise)
  await p.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; }",
  });
  const r = await new AxeBuilder({ page: p })
    .include('[data-testid="mp-lobby"], [data-testid="mp-podium"]')
    .analyze();
  return r.violations.flatMap((v) =>
    v.nodes.map((n) => ({ id: v.id, target: n.target.join(" ") })),
  );
}

async function guestSays(mock: Mock, presetId: string): Promise<number> {
  mock.push({ type: "chat:preset", playerId: GUEST, presetId });
  return Date.now();
}

async function toResults(mock: Mock): Promise<void> {
  mock.state.phase = "results";
  mock.push(RESULTS);
  mock.sync();
}

for (const [theme, mono] of THEMES) {
  test(`STRICT bubbles + dogs: ${theme} 1280`, async ({ page: p }) => {
    test.setTimeout(240_000);
    await p.setViewportSize({ width: 1280, height: 900 });
    const mock = await mockServer(p, FEATURES);
    await openLobby(p, theme);
    await dismissBanner(p);
    expect(
      await p.evaluate(() => document.documentElement.dataset["pug"] ?? ""),
    ).toBe(mono ? "mono" : "");
    await watchLive(p);

    // dogs keep their own colours (lobby heads, picker, your big dog) even in mono themes
    const guestHead = lobbyRow(p, GUEST).locator(
      '[data-testid="mp-player-character"]',
    );
    await expect(guestHead).toHaveAttribute("data-character", "chowie");
    await expect(guestHead.locator("svg")).toBeAttached();
    const myHead = lobbyRow(p, ME).locator(
      '[data-testid="mp-player-character"]',
    );
    await expect(myHead.locator("svg")).toBeAttached();
    expect(await maxFillChroma(guestHead)).toBeGreaterThan(20);
    expect(await maxFillChroma(myHead)).toBeGreaterThan(20);
    expect(
      await myHead.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--pug-fill").trim(),
      ),
    ).not.toMatch(/^#f{3}(f{3})?$/i);
    const picker = byTestId(p, "mp-character-picker");
    await expect(picker.locator("svg")).toHaveCount(8);
    for (const tile of await picker.locator('[role="radio"]').all()) {
      expect(await maxFillChroma(tile)).toBeGreaterThan(20);
    }

    // baseline axe before any bubble
    const before = await axeFindings(p);

    // a bubble after the guest's name
    const t0 = await guestSays(mock, "good-luck");
    const guest = lobbyRow(p, GUEST);
    const guestName = guest.locator(`span[title="${GUEST_NAME}"]`).first();
    await expectPlacement(guest, guestName, "good-luck");
    await p.waitForTimeout(400); // past the pop
    const bubbleText = await measureText(
      p,
      '[data-testid="mp-quickchat-bubble"]',
    );
    expect(bubbleText.length).toBeGreaterThan(0);
    for (const r of bubbleText) {
      expect(r.ratio, `${theme} bubble "${r.text}"`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    // axe with the bubble up: nothing new, and no colour-contrast on it
    const after = await axeFindings(p);
    const key = (f: AxeFinding): string => `${f.id} ${f.target}`;
    const fresh = after.filter((f) => !before.map(key).includes(key(f)));
    expect(fresh).toEqual([]);
    expect(
      after.filter(
        (f) => f.id === "color-contrast" && f.target.includes("bubble"),
      ),
    ).toEqual([]);
    await p.screenshot({ path: `${SCREENS}/qc-strict-${theme}-lobby.png` });

    // gone at ~4s (still there at 3s)
    const wait3 = t0 + 3000 - Date.now();
    if (wait3 > 0) await p.waitForTimeout(wait3);
    await expect(bubbleOf(guest)).toHaveCount(1);
    await expect(bubbleOf(guest)).toHaveCount(0, { timeout: 3000 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(3700);
    expect(Date.now() - t0).toBeLessThan(5500);
    // exactly one announcement for that one message
    expect(await said(p)).toEqual([`${GUEST_NAME} says: good luck!`]);

    // replaced by the same sender, timer restarted
    await guestSays(mock, "gg");
    await expect(bubbleOf(guest)).toHaveAttribute("data-preset-id", "gg");
    await p.waitForTimeout(2000);
    const t1 = await guestSays(mock, "e-paw");
    await expect(bubbleOf(guest)).toHaveCount(1);
    await expect(bubbleOf(guest)).toHaveAttribute("data-preset-id", "e-paw");
    await p.waitForTimeout(t1 + 3000 - Date.now());
    await expect(bubbleOf(guest)).toHaveCount(1);
    await expect(bubbleOf(guest)).toHaveCount(0, { timeout: 3000 });

    // history: collapsed disclosure, keyboard opens it
    const history = byTestId(p, "mp-quickchat-history");
    await expect(byTestId(p, "mp-quickchat-history-toggle")).toHaveText(
      "recent quick-chat (3)",
    );
    await expect(byTestId(p, "mp-quickchat-feed-item").first()).toBeHidden();
    await byTestId(p, "mp-quickchat-history-toggle").focus();
    await p.keyboard.press("Enter");
    await expect(history).toHaveAttribute("open", "");
    await expect(byTestId(p, "mp-quickchat-feed-item")).toHaveCount(3);
    await expect(byTestId(p, "mp-quickchat-feed-item").first()).toBeVisible();
    // QA M03-B: every quick-chat text >= 4.5:1 in this theme, history open
    await p.mouse.move(1, 1);
    await p.waitForTimeout(400);
    const panelText = await measureText(p, '[data-testid="mp-quickchat"]');
    expect(panelText.length).toBeGreaterThan(5);
    for (const r of panelText) {
      expect(r.ratio, `${theme} quick-chat "${r.text}"`).toBeGreaterThanOrEqual(
        4.5,
      );
    }

    // muted sender: no bubble; unmuted again for the rest
    const mute = p.locator(
      `[data-testid="mp-quickchat-mute"][data-player-id="${GUEST}"]`,
    );
    await mute.click();
    await guestSays(mock, "hello");
    await p.waitForTimeout(400);
    await expect(byTestId(p, "mp-quickchat-bubble")).toHaveCount(0);
    await mute.click();

    // hide: a visible bubble goes at once, new ones never show
    await guestSays(mock, "hello");
    await expect(bubbleOf(guest)).toHaveCount(1);
    await byTestId(p, "mp-quickchat-hide").check();
    await expect(byTestId(p, "mp-quickchat-bubble")).toHaveCount(0);
    await guestSays(mock, "gg");
    await p.waitForTimeout(400);
    await expect(byTestId(p, "mp-quickchat-bubble")).toHaveCount(0);
    await byTestId(p, "mp-quickchat-hide").uncheck();

    // racing: a lingering bubble goes, nothing new shows
    await guestSays(mock, "ready");
    await expect(bubbleOf(guest)).toHaveCount(1);
    mock.state.phase = "countdown";
    mock.sync();
    await expect(byTestId(p, "mp-quickchat-bubble")).toHaveCount(0);
    mock.state.phase = "racing";
    mock.sync();
    await guestSays(mock, "gg");
    await p.waitForTimeout(600);
    await expect(byTestId(p, "mp-quickchat-bubble")).toHaveCount(0);

    // podium: the bubble sits after the name in the results row; podium dogs in colour
    await toResults(mock);
    await expect(byTestId(p, "mp-podium")).toBeVisible();
    const winner = byTestId(p, "mp-pug-winner");
    await expect(winner.locator("svg")).toBeAttached();
    expect(await maxFillChroma(winner)).toBeGreaterThan(20);
    const before2 = await axeFindings(p);
    await guestSays(mock, "rematch");
    const row = resultRow(p, GUEST);
    await expectPlacement(row, byTestId(row, "mp-result-name"), "rematch");
    await p.waitForTimeout(400);
    const after2 = await axeFindings(p);
    expect(after2.filter((f) => !before2.map(key).includes(key(f)))).toEqual(
      [],
    );
    for (const r of await measureText(
      p,
      '[data-testid="mp-quickchat-bubble"]',
    )) {
      expect(r.ratio, `${theme} podium bubble`).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      await maxFillChroma(row.locator('[data-testid="mp-result-character"]')),
    ).toBeGreaterThan(20);
    await p.screenshot({ path: `${SCREENS}/qc-strict-${theme}-podium.png` });
  });

  test(`STRICT bubble placement at 390px: ${theme}`, async ({ page: p }) => {
    await p.setViewportSize({ width: 390, height: 844 });
    const mock = await mockServer(p, FEATURES);
    await openLobby(p, theme);
    await dismissBanner(p);
    // the longest line, from both players
    await guestSays(mock, "good-luck");
    await byTestId(p, "mp-quickchat-line-good-luck").click();
    for (const id of [GUEST, ME]) {
      const row = lobbyRow(p, id);
      const name = row
        .locator(`span[title="${id === ME ? ME_NAME : GUEST_NAME}"]`)
        .first();
      await expectPlacement(row, name, "good-luck");
    }
    await p.screenshot({ path: `${SCREENS}/qc-strict-${theme}-lobby-390.png` });
    await toResults(mock);
    await guestSays(mock, "rematch");
    const row = resultRow(p, GUEST);
    await expectPlacement(row, byTestId(row, "mp-result-name"), "rematch");
    await p.screenshot({
      path: `${SCREENS}/qc-strict-${theme}-podium-390.png`,
    });
  });
}

test("STRICT reduced motion: no pop/fade, removed at ~4s", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const p = await ctx.newPage();
  const mock = await mockServer(p, FEATURES);
  await openLobby(p, "serika_dark");
  const t0 = await guestSays(mock, "gg");
  const bubble = bubbleOf(lobbyRow(p, GUEST));
  await expect(bubble).toHaveCount(1);
  expect(
    await bubble.evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await p.waitForTimeout(t0 + 3800 - Date.now());
  await expect(bubble).not.toHaveAttribute("data-fading", "true");
  await expect(bubble).toHaveCSS("opacity", "1");
  await expect(bubble).toHaveCount(0, { timeout: 2000 });
  await ctx.close();
});

test("STRICT typing mascot stays mono in a mono theme", async ({ page: p }) => {
  await p.goto("/");
  await p.locator("#words .word").first().waitFor({ timeout: 180_000 });
  await p.waitForFunction(() => "__mt" in window);
  await p.evaluate(() => {
    const mt = (
      window as unknown as {
        __mt: { setConfig: (k: string, v: unknown) => void };
      }
    ).__mt;
    mt.setConfig("theme", "serika_dark");
    mt.setConfig("monkey", true);
  });
  const words = await p.$$eval("#words .word", (els) =>
    els.slice(0, 3).map((el) => el.textContent ?? ""),
  );
  await p.keyboard.type(`${words.join(" ")} `, { delay: 60 });
  const pug = p.locator('[data-ui-element="pug"]');
  await expect(pug.locator("svg").first()).toBeAttached();
  expect(await p.evaluate(() => document.documentElement.dataset["pug"])).toBe(
    "mono",
  );
  await expect(pug.locator(".dog-color")).toHaveCount(0);
  // the mono token reaches the mascot (pug-fast may mix heat into --pug-fill on the pug itself)
  expect(await pug.evaluate((el) => el.closest(".dog-color"))).toBeNull();
  expect(
    await p.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--pug-fill")
        .trim()
        .toLowerCase(),
    ),
  ).toMatch(/^#f{3}(f{3})?$/);
  // the mascot's own fill is still the white mono coat (pug-fast only mixes heat into it)
  expect(
    await pug.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--pug-fill").toLowerCase(),
    ),
  ).toMatch(/#f{3}(f{3})?\b/);
});
