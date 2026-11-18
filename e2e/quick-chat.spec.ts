import { mkdirSync } from "node:fs";

import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  test,
  type Locator,
  type Page,
  type WebSocketRoute,
} from "@playwright/test";

// Preset quick-chat, with the /ws server mocked in the browser (page.routeWebSocket): no real server,
// no rooms, nothing leaves the machine. The client flag is on by default; the mocked welcome decides
// welcome.features.quickChat.
const AGE_KEY = "puggie-mp-age-confirmed";
const SCREENS = process.env["SCREENS_DIR"] ?? "e2e/screens";
mkdirSync(SCREENS, { recursive: true });

const byTestId = (page: Page | Locator, id: string): Locator =>
  page.locator(`[data-testid="${id}"]`);

const ME = "p-me";
const GUEST = "p-guest";

type Phase = "lobby" | "countdown" | "racing" | "results";

type MockPlayer = {
  id: string;
  name: string;
  isBot: boolean;
  color: string;
  ready: boolean;
  inLobby: boolean;
  connected: boolean;
  character: string;
  progress: {
    wordIndex: number;
    charIndex: number;
    testMs: number;
    wpm: number;
  };
  finished: boolean;
};

function player(
  id: string,
  name: string,
  color: string,
  isBot = false,
): MockPlayer {
  return {
    id,
    name,
    isBot,
    color,
    ready: false,
    inLobby: false,
    connected: true,
    character: "puggie",
    progress: { wordIndex: 0, charIndex: 0, testMs: 0, wpm: 0 },
    finished: false,
  };
}

type RoomOpts = { phase?: Phase; open?: boolean; quickMatch?: boolean };

function roomState(opts: RoomOpts = {}): Record<string, unknown> {
  return {
    type: "room:state",
    code: "TESTAB",
    hostId: ME,
    phase: opts.phase ?? "lobby",
    settings: {
      mode: "time",
      mode2: 30,
      punctuation: false,
      numbers: false,
      language: "english",
    },
    settingsVersion: 1,
    open: opts.open ?? false,
    quickMatch: opts.quickMatch ?? false,
    players: [
      player(ME, "Brave Pug", "opp1"),
      player(GUEST, "Quiet Beagle", "opp2"),
    ],
  };
}

type Mock = {
  /** every client message, parsed */
  received: Record<string, unknown>[];
  /** push a frame to the page */
  push: (msg: unknown) => void;
};

/** the mocked server: answers ping/hello, builds the room on room:create, relays chat:preset back */
async function mockServer(
  page: Page,
  opts: { quickChat: boolean; room?: RoomOpts },
): Promise<Mock> {
  const mock: Mock = { received: [], push: () => undefined };
  await page.routeWebSocket(/\/ws$/, (ws: WebSocketRoute) => {
    mock.push = (msg) => ws.send(JSON.stringify(msg));
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw)) as Record<string, unknown>;
      mock.received.push(msg);
      if (msg["type"] === "ping") {
        mock.push({ type: "pong", t: msg["t"], serverNow: Date.now() });
      } else if (msg["type"] === "hello") {
        mock.push({
          type: "welcome",
          playerId: ME,
          sessionToken: "t".repeat(32),
          name: "Brave Pug",
          protocol: 1,
          features: { quickChat: opts.quickChat },
        });
      } else if (msg["type"] === "room:create") {
        mock.push(roomState(opts.room));
      } else if (msg["type"] === "chat:preset") {
        mock.push({
          type: "chat:preset",
          playerId: ME,
          presetId: msg["presetId"],
        });
      }
    });
  });
  return mock;
}

async function openLobby(
  page: Page,
  init?: (page: Page) => Promise<void>,
): Promise<void> {
  await page.addInitScript((key) => localStorage.setItem(key, "true"), AGE_KEY);
  await init?.(page);
  await page.goto("/race");
  await expect(byTestId(page, "race-page")).toBeVisible({ timeout: 180_000 });
  await byTestId(page, "mp-create").click();
  await expect(byTestId(page, "mp-room-code")).toBeVisible();
}

/** the analytics banner would cover the bottom of a screenshot */
async function dismissBanner(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: "reject analytics" });
  if (await reject.isVisible()) {
    await reject.click();
    await page.waitForTimeout(800); // the banner fades out
  }
}

const chatFrames = (mock: Mock): Record<string, unknown>[] =>
  mock.received.filter((m) => m["type"] === "chat:preset");

test("flag off in welcome: no quick-chat anywhere", async ({ page }) => {
  const mock = await mockServer(page, { quickChat: false });
  await openLobby(page);
  await expect(byTestId(page, "mp-player-list")).toBeVisible();
  await expect(byTestId(page, "mp-quickchat")).toHaveCount(0);
  await expect(byTestId(page, "mp-quickchat-mute")).toHaveCount(0);
  // a relay anyway (a stray frame) shows nothing
  mock.push({ type: "chat:preset", playerId: GUEST, presetId: "gg" });
  await page.waitForTimeout(300);
  await expect(byTestId(page, "mp-quickchat-bubble")).toHaveCount(0);
});

test("lobby picker: 14 lines + 8 emotes, no free text, sends ids only, shows broadcasts", async ({
  page,
}) => {
  const mock = await mockServer(page, { quickChat: true });
  await openLobby(page);
  const panel = byTestId(page, "mp-quickchat");
  await expect(panel).toBeVisible();

  await expect(
    panel.locator('[data-testid^="mp-quickchat-line-"]'),
  ).toHaveCount(14);
  await expect(
    panel.locator('[data-testid^="mp-quickchat-emote-"]'),
  ).toHaveCount(8);
  await expect(byTestId(page, "mp-quickchat-emote-e-handshake")).toBeVisible();
  await expect(
    panel.locator(
      'input[type="text"], input:not([type]), textarea, [contenteditable]',
    ),
  ).toHaveCount(0);

  // two clicks in the same tick: the gap holds the second back (the cooldown UI mirrors the server's)
  await page.evaluate(() => {
    for (const id of ["thanks", "hello"]) {
      document
        .querySelector<HTMLElement>(`[data-testid="mp-quickchat-line-${id}"]`)
        ?.click();
    }
  });
  await expect.poll(() => chatFrames(mock).length).toBe(1);
  expect(chatFrames(mock)[0]).toEqual({
    type: "chat:preset",
    presetId: "thanks",
  });
  await expect(byTestId(page, "mp-quickchat-line-hello")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(byTestId(page, "mp-quickchat-line-hello")).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  expect(chatFrames(mock)).toHaveLength(1);
  // the same id stays locked for a few seconds
  await expect(byTestId(page, "mp-quickchat-line-thanks")).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // send a line with the keyboard
  const gg = byTestId(page, "mp-quickchat-line-gg");
  await gg.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => chatFrames(mock).length).toBe(2);
  expect(chatFrames(mock)[1]).toEqual({ type: "chat:preset", presetId: "gg" });

  // our own relay shows in the feed and next to our name
  await expect(byTestId(page, "mp-quickchat-feed-item")).toHaveCount(2);
  await expect(
    page
      .locator('[data-testid="mp-player"][data-player-id="p-me"]')
      .locator('[data-testid="mp-quickchat-bubble"]'),
  ).toHaveText("gg");

  // an emote
  const handshake = byTestId(page, "mp-quickchat-emote-e-handshake");
  await expect(handshake).toHaveAttribute("aria-disabled", "false");
  await handshake.click();
  await expect.poll(() => chatFrames(mock).length).toBe(3);
  expect(chatFrames(mock)[2]).toEqual({
    type: "chat:preset",
    presetId: "e-handshake",
  });

  // a guest's message, and an unknown id that must be dropped
  mock.push({ type: "chat:preset", playerId: GUEST, presetId: "good-luck" });
  mock.push({ type: "chat:preset", playerId: GUEST, presetId: "<b>hi</b>" });
  mock.push({ type: "chat:preset", playerId: "p-stranger", presetId: "gg" });
  await expect(byTestId(page, "mp-quickchat-feed-item")).toHaveCount(4);
  await expect(
    page
      .locator('[data-testid="mp-player"][data-player-id="p-guest"]')
      .locator('[data-testid="mp-quickchat-bubble"]'),
  ).toHaveText("good luck!");

  await dismissBanner(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: `${SCREENS}/quickchat-lobby-picker.png` });

  // axe reads the colour mid-transition otherwise (the hovered send button was
  // still fading): flaky contrast reads, not a real violation
  await page.mouse.move(0, 0);
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; }",
  });
  const results = await new AxeBuilder({ page })
    .include('[data-testid="mp-quickchat"]')
    .analyze();
  expect(
    results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
  ).toEqual([]);
});

test("mute a player: their messages vanish and stay muted for this tab; unmute brings them back", async ({
  page,
}) => {
  const mock = await mockServer(page, { quickChat: true });
  await openLobby(page);
  const mute = page.locator(
    '[data-testid="mp-quickchat-mute"][data-player-id="p-guest"]',
  );
  // no mute button for ourselves
  await expect(
    page.locator('[data-testid="mp-quickchat-mute"][data-player-id="p-me"]'),
  ).toHaveCount(0);

  mock.push({ type: "chat:preset", playerId: GUEST, presetId: "hello" });
  await expect(byTestId(page, "mp-quickchat-feed-item")).toHaveCount(1);
  await mute.click();
  await expect(byTestId(page, "mp-quickchat-muted-chip")).toBeVisible();
  await expect(byTestId(page, "mp-quickchat-feed-item")).toHaveCount(0);
  mock.push({ type: "chat:preset", playerId: GUEST, presetId: "gg" });
  await page.waitForTimeout(300);
  await expect(byTestId(page, "mp-quickchat-feed-item")).toHaveCount(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem("puggie-qc-muted")),
  ).toBe(JSON.stringify(["p-guest"]));

  await mute.click();
  await expect(byTestId(page, "mp-quickchat-muted-chip")).toHaveCount(0);
  mock.push({ type: "chat:preset", playerId: GUEST, presetId: "gg" });
  await expect(byTestId(page, "mp-quickchat-feed-item")).toHaveCount(1);
});

test("hide quick-chat switch: hides everything and is remembered in localStorage", async ({
  page,
}) => {
  const mock = await mockServer(page, { quickChat: true });
  await openLobby(page);
  await byTestId(page, "mp-quickchat-hide").check();
  await expect(byTestId(page, "mp-quickchat-panel")).toHaveCount(0);
  await expect(byTestId(page, "mp-quickchat-mute")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("puggie-qc-hidden")),
  ).toBe("1");
  mock.push({ type: "chat:preset", playerId: GUEST, presetId: "gg" });
  await page.waitForTimeout(300);
  await expect(byTestId(page, "mp-quickchat-bubble")).toHaveCount(0);

  await byTestId(page, "mp-quickchat-hide").uncheck();
  await expect(byTestId(page, "mp-quickchat-line-gg")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("puggie-qc-hidden")),
  ).toBeNull();
});

// QA M03: guard the 24px target size and the 4.5:1 text contrast (WCAG 2.5.8, 1.4.3) of the quick-chat controls
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  test(`hide quick-chat label is at least 24px tall and quick-chat text has 4.5:1 contrast at ${vp.width}x${vp.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    const mock = await mockServer(page, { quickChat: true });
    await openLobby(page);
    await dismissBanner(page);
    mock.push({ type: "chat:preset", playerId: GUEST, presetId: "gg" });
    await expect(byTestId(page, "mp-quickchat-line-gg")).toBeVisible();

    const label = byTestId(page, "mp-quickchat-hide").locator(
      "xpath=ancestor::label",
    );
    await label.scrollIntoViewIfNeeded();
    const box = await label.boundingBox();
    expect(box, "hide label has a box").not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);

    await page.mouse.move(1, 1);
    const rows = await page.evaluate(() => {
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
      // composite the ancestors' backgrounds, nearest first, until an opaque one
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
      for (const root of document.querySelectorAll(
        '[data-testid="mp-quickchat"]',
      )) {
        for (const e of root.querySelectorAll("*")) {
          const own = [...e.childNodes].some(
            (c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== "",
          );
          if (!own) continue;
          const r = e.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // faded (disabled/cooldown) controls are exempt from 1.4.3
          const op = opacityOf(e);
          if (op < 1) continue;
          const fg0 = rgba(getComputedStyle(e).color);
          const fg = over(fg0, bgOf(e));
          out.push({
            text: (e.textContent ?? "").trim().slice(0, 28),
            ratio: ratio(fg, bgOf(e)),
          });
        }
      }
      return out;
    });
    expect(rows.length, "measured some quick-chat text").toBeGreaterThan(3);
    for (const row of rows) {
      expect(row.ratio, `contrast of "${row.text}"`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
}

test("phases: paused in countdown/racing, collapsed disclosure in results, back to the lobby", async ({
  page,
}) => {
  const mock = await mockServer(page, { quickChat: true });
  await openLobby(page);
  await expect(byTestId(page, "mp-quickchat-line-gg")).toBeVisible();

  mock.push({ type: "chat:preset", playerId: GUEST, presetId: "gg" });
  await expect(byTestId(page, "mp-quickchat-bubble")).toHaveCount(1);

  // a countdown starts: last race's bubbles go and nothing can be sent
  mock.push(roomState({ phase: "countdown" }));
  await expect(byTestId(page, "mp-quickchat-bubble")).toHaveCount(0);
  mock.push({ type: "chat:preset", playerId: GUEST, presetId: "gg" });
  await page.waitForTimeout(300);
  await expect(byTestId(page, "mp-quickchat-feed-item")).toHaveCount(1);
  expect(chatFrames(mock)).toHaveLength(0);
  await byTestId(page, "mp-quickchat-line-hello")
    .click({ force: true, trial: false })
    .catch(() => undefined);
  expect(chatFrames(mock)).toHaveLength(0);

  // results: a collapsed disclosure that keeps rematch/leave above the fold
  mock.push({
    type: "race:results",
    results: [
      {
        playerId: ME,
        name: "Brave Pug",
        isBot: false,
        place: 1,
        wpm: 62,
        raw: 64,
        acc: 98,
        testMs: 30000,
        finished: true,
        flagged: false,
        reasons: [],
      },
      {
        playerId: GUEST,
        name: "Quiet Beagle",
        isBot: false,
        place: 2,
        wpm: 55,
        raw: 58,
        acc: 96,
        testMs: 30000,
        finished: true,
        flagged: false,
        reasons: [],
      },
    ],
  });
  mock.push(roomState({ phase: "results" }));
  const toggle = byTestId(page, "mp-quickchat-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(byTestId(page, "mp-quickchat-line-gg")).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(byTestId(page, "mp-leave")).toBeInViewport();
  await dismissBanner(page);
  await page.screenshot({ path: `${SCREENS}/quickchat-results-collapsed.png` });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await byTestId(page, "mp-quickchat-line-rematch").click();
  await expect.poll(() => chatFrames(mock).length).toBe(1);
  expect(chatFrames(mock)[0]).toEqual({
    type: "chat:preset",
    presetId: "rematch",
  });
  await expect(
    page
      .locator('[data-testid="mp-result-row"]')
      .locator('[data-testid="mp-quickchat-bubble"]'),
  ).toHaveText("rematch?");
  await dismissBanner(page);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.screenshot({ path: `${SCREENS}/quickchat-results-messages.png` });
});

test("never in Quick Match rooms or Open Rooms", async ({ page }) => {
  const qm = await mockServer(page, {
    quickChat: true,
    room: { quickMatch: true },
  });
  await openLobby(page);
  await expect(byTestId(page, "mp-player-list")).toBeVisible();
  await expect(byTestId(page, "mp-quickchat")).toHaveCount(0);
  qm.push({ type: "chat:preset", playerId: GUEST, presetId: "gg" });
  await page.waitForTimeout(300);
  await expect(byTestId(page, "mp-quickchat-bubble")).toHaveCount(0);
});

test("never in an open (listed) room", async ({ page }) => {
  await mockServer(page, { quickChat: true, room: { open: true } });
  await openLobby(page);
  await expect(byTestId(page, "mp-player-list")).toBeVisible();
  await expect(byTestId(page, "mp-quickchat")).toHaveCount(0);
});

test("kids flow: fully hidden even with the flag on", async ({ page }) => {
  await mockServer(page, { quickChat: true });
  await openLobby(page, async (p) => {
    await p.addInitScript(() =>
      sessionStorage.setItem("puggie-kids-flow", "1"),
    );
  });
  await expect(byTestId(page, "mp-player-list")).toBeVisible();
  await expect(byTestId(page, "mp-quickchat")).toHaveCount(0);
  await expect(byTestId(page, "mp-quickchat-mute")).toHaveCount(0);
});
