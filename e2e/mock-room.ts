import {
  expect,
  type Locator,
  type Page,
  type WebSocketRoute,
} from "@playwright/test";

// A mocked /ws server (page.routeWebSocket): the page never connects anywhere,
// no rooms are created on a real server.
export const AGE_KEY = "puggie-mp-age-confirmed";
export const ME = "p-me";
export const GUEST = "p-guest";
export const ME_NAME = "Brave Pug";
export const GUEST_NAME = "Quiet Beagle";

export type Phase = "lobby" | "countdown" | "racing" | "results";

export const byTestId = (page: Page | Locator, id: string): Locator =>
  page.locator(`[data-testid="${id}"]`);

export function player(
  id: string,
  name: string,
  color: string,
  character = "puggie",
): Record<string, unknown> {
  return {
    id,
    name,
    isBot: false,
    color,
    ready: false,
    inLobby: false,
    connected: true,
    character,
    progress: { wordIndex: 0, charIndex: 0, testMs: 0, wpm: 0 },
    finished: false,
  };
}

/**
 * players 3..8 for the crowded-room variants (distinct ids, colours, picker
 * dogs); two 20-char names prove long names still truncate
 */
export const EXTRA_PLAYERS = [
  { id: "p-3", name: "Sleepy Corgi", color: "opp3", dog: "frenchie" },
  { id: "p-4", name: "Captain Fluffybottom", color: "opp4", dog: "tuckie" },
  { id: "p-5", name: "Zoomie Husky", color: "opp5", dog: "huskie" },
  { id: "p-6", name: "Sir Wigglesworth III", color: "opp6", dog: "corgie" },
  { id: "p-7", name: "Tiny Shiba", color: "opp7", dog: "shibie" },
  { id: "p-8", name: "Golden Snoot", color: "opp8", dog: "goldie" },
] as const;

export type MockState = {
  phase: Phase;
  myDog: string;
  guestDog: string;
  /** room size, 2 (default) to 8: you, the guest, then EXTRA_PLAYERS */
  players?: number;
};

const extras = (count = 2): (typeof EXTRA_PLAYERS)[number][] =>
  EXTRA_PLAYERS.slice(0, Math.max(0, count - 2));

export function roomState(s: MockState): Record<string, unknown> {
  return {
    type: "room:state",
    code: "TESTAB",
    hostId: ME,
    phase: s.phase,
    settings: {
      mode: "time",
      mode2: 30,
      punctuation: false,
      numbers: false,
      language: "english",
    },
    settingsVersion: 1,
    open: false,
    quickMatch: false,
    players: [
      player(ME, ME_NAME, "opp1", s.myDog),
      player(GUEST, GUEST_NAME, "opp2", s.guestDog),
      ...extras(s.players).map((x) => player(x.id, x.name, x.color, x.dog)),
    ],
  };
}

/** race:results for a room of `count` players (you win, then the guest, ...) */
export function results(count = 2): Record<string, unknown> {
  return {
    type: "race:results",
    results: [
      [ME, ME_NAME],
      [GUEST, GUEST_NAME],
      ...extras(count).map((x) => [x.id, x.name]),
    ].map(([playerId, name], i) => ({
      playerId,
      name,
      isBot: false,
      place: i + 1,
      wpm: 62 - i * 7,
      raw: 64 - i * 7,
      acc: 97,
      testMs: 30000,
      finished: true,
      flagged: false,
      reasons: [],
    })),
  };
}

export const RESULTS = {
  type: "race:results",
  results: [
    [ME, ME_NAME, 1, 62],
    [GUEST, GUEST_NAME, 2, 55],
  ].map(([playerId, name, place, wpm]) => ({
    playerId,
    name,
    isBot: false,
    place,
    wpm,
    raw: Number(wpm) + 2,
    acc: 97,
    testMs: 30000,
    finished: true,
    flagged: false,
    reasons: [],
  })),
};

export type Mock = {
  received: Record<string, unknown>[];
  state: MockState;
  /** answer every chat:preset send with RATE_LIMITED instead of relaying it */
  rate: boolean;
  push: (msg: unknown) => void;
  /** push room:state for the current `state` */
  sync: () => void;
};

/** answers ping/hello, builds the room on room:create, relays chat:preset and player:character back */
export async function mockServer(
  page: Page,
  features: Record<string, boolean>,
  opts: { players?: number } = {},
): Promise<Mock> {
  const mock: Mock = {
    received: [],
    state: {
      phase: "lobby",
      myDog: "puggie",
      guestDog: "chowie",
      players: opts.players,
    },
    rate: false,
    push: () => undefined,
    sync: () => mock.push(roomState(mock.state)),
  };
  await page.routeWebSocket(/\/ws$/, (ws: WebSocketRoute) => {
    mock.push = (msg) => ws.send(JSON.stringify(msg));
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw)) as Record<string, unknown>;
      mock.received.push(msg);
      const type = msg["type"];
      if (type === "ping") {
        mock.push({ type: "pong", t: msg["t"], serverNow: Date.now() });
      } else if (type === "hello") {
        if (typeof msg["character"] === "string") {
          mock.state.myDog = msg["character"];
        }
        mock.push({
          type: "welcome",
          playerId: ME,
          sessionToken: "t".repeat(32),
          name: ME_NAME,
          protocol: 1,
          features,
        });
      } else if (type === "room:create") {
        mock.sync();
      } else if (type === "player:character") {
        mock.state.myDog = String(msg["character"]);
        mock.sync();
      } else if (type === "chat:preset" && mock.rate) {
        mock.push({
          type: "error",
          code: "RATE_LIMITED",
          message: "Too many messages",
        });
      } else if (type === "chat:preset") {
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

/** theme via the saved config (first load only), age gate passed */
export async function openLobby(page: Page, theme?: string): Promise<void> {
  await page.addInitScript((key) => localStorage.setItem(key, "true"), AGE_KEY);
  if (theme !== undefined) {
    await page.addInitScript(
      ([k, t]) => {
        if (localStorage.getItem(k) === null) {
          localStorage.setItem(k, JSON.stringify({ theme: t }));
        }
      },
      ["config", theme] as [string, string],
    );
  }
  await page.goto("/race");
  await expect(byTestId(page, "race-page")).toBeVisible({ timeout: 180_000 });
  await byTestId(page, "mp-create").click();
  await expect(byTestId(page, "mp-room-code")).toBeVisible();
}

/** the analytics banner would cover part of the page */
export async function dismissBanner(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: "reject analytics" });
  if (await reject.isVisible()) {
    await reject.click();
    await page.waitForTimeout(800);
  }
}

/**
 * Highest chroma (max-min of r,g,b) over the painted fills inside `el`'s svg:
 * the mono render is white + near-black ink (chroma ~0), the art's own
 * palette is not.
 */
export async function maxFillChroma(el: Locator): Promise<number> {
  return el.evaluate((root) => {
    let best = 0;
    for (const n of root.querySelectorAll("svg *")) {
      const fill = getComputedStyle(n).fill;
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(fill);
      if (m === null) continue;
      const [r, g, b] = [m[1], m[2], m[3]].map(Number) as [
        number,
        number,
        number,
      ];
      best = Math.max(best, Math.max(r, g, b) - Math.min(r, g, b));
    }
    return best;
  });
}
