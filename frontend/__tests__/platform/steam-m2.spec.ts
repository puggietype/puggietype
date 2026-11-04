import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredWsUrl } from "../../src/ts/multiplayer/flags";
import { PRODUCTION_WS_URL, wsUrl } from "../../src/ts/multiplayer/helpers";
import { leaderboardHttpBase } from "../../src/ts/multiplayer/leaderboards";
import { terminatedMessage } from "../../src/ts/multiplayer/terminated";
import {
  CLOSE_UPGRADE_REQUIRED,
  ClientMessageSchema,
  isServerProtocolSupported,
  PROTOCOL_VERSION,
} from "../../src/ts/multiplayer/protocol";
import { shareOrigin, SITE_ORIGIN } from "../../src/ts/utils/site-url";
import {
  DesktopBridge,
  getDesktopBridge,
} from "../../src/ts/platform/desktop-bridge";
import { steamAdapter } from "../../src/ts/platform/steam";
import { configMetadata } from "../../src/ts/config/metadata";

const fileLocation = {
  protocol: "app:",
  host: "puggietype",
  hostname: "puggietype",
};

describe("steam ws URL", () => {
  it("steam with no VITE_WS_URL uses the production server", () => {
    expect(configuredWsUrl(undefined, "steam")).toBe(PRODUCTION_WS_URL);
    expect(configuredWsUrl("", "steam")).toBe(PRODUCTION_WS_URL);
  });
  it("an explicit VITE_WS_URL wins on both platforms", () => {
    expect(configuredWsUrl("wss://staging/ws", "steam")).toBe(
      "wss://staging/ws",
    );
    expect(configuredWsUrl("wss://staging/ws", "web")).toBe("wss://staging/ws");
  });
  it("web with no VITE_WS_URL keeps same-origin behavior", () => {
    expect(configuredWsUrl(undefined, "web")).toBeUndefined();
  });
  it("the race socket and the leaderboard base both follow it", () => {
    const configured = configuredWsUrl(undefined, "steam");
    expect(wsUrl(fileLocation, configured)).toBe(PRODUCTION_WS_URL);
    expect(leaderboardHttpBase(fileLocation, configured)).toBe(
      "https://ws.puggietype.com",
    );
  });
});

describe("protocol versioning (client)", () => {
  it("accepts only supported server protocols", () => {
    expect(isServerProtocolSupported(PROTOCOL_VERSION)).toBe(true);
    expect(isServerProtocolSupported(0)).toBe(false);
    expect(isServerProtocolSupported(PROTOCOL_VERSION + 1)).toBe(false);
    expect(isServerProtocolSupported(undefined)).toBe(false);
    expect(isServerProtocolSupported("1")).toBe(false);
  });
  it("hello schema allows protocol, engine and platform", () => {
    const r = ClientMessageSchema.safeParse({
      type: "hello",
      protocol: 1,
      engine: "TESTING",
      platform: "steam",
    });
    expect(r.success).toBe(true);
  });
  it("upgrade text is platform specific", () => {
    expect(terminatedMessage(CLOSE_UPGRADE_REQUIRED, "steam")).toMatch(/Steam/);
    expect(terminatedMessage(CLOSE_UPGRADE_REQUIRED, "web")).toMatch(/Reload/);
    expect(terminatedMessage(4000, "web")).toMatch(/another tab/);
    expect(terminatedMessage(4002, "steam")).toMatch(/full/);
  });
});

describe("theme share link", () => {
  it("steam links to the website, web keeps the current origin", () => {
    expect(shareOrigin("steam", "app://puggietype")).toBe(SITE_ORIGIN);
    expect(shareOrigin("web", "http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });
});

describe("ads config", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ads = configMetadata.ads as unknown as {
    overrideValue: (o: { value: string }) => string;
    isBlocked: (o: { value: string }) => boolean;
  };
  it("is forced off and blocked on steam", () => {
    vi.stubGlobal("__PLATFORM__", "steam");
    expect(ads.overrideValue({ value: "on" })).toBe("off");
    expect(ads.isBlocked({ value: "on" })).toBe(true);
    expect(ads.isBlocked({ value: "off" })).toBe(false);
  });
});

describe("desktop bridge", () => {
  afterEach(() => vi.unstubAllGlobals());
  function fakeBridge(): DesktopBridge & {
    full: boolean;
    data: Map<string, string>;
  } {
    const b = {
      version: 1 as const,
      full: false,
      data: new Map<string, string>(),
      fullscreen: {
        isFullscreen: () => b.full,
        toggle: () => {
          b.full = !b.full;
        },
      },
      storage: {
        getItem: (k: string) => b.data.get(k) ?? null,
        setItem: (k: string, v: string) => void b.data.set(k, v),
        removeItem: (k: string) => void b.data.delete(k),
      },
    };
    return b;
  }
  it("ignores missing or malformed bridges", () => {
    expect(getDesktopBridge({})).toBeUndefined();
    expect(getDesktopBridge({ puggieDesktop: { version: 2 } })).toBeUndefined();
    expect(getDesktopBridge({ puggieDesktop: null })).toBeUndefined();
  });
  it("steam adapter uses the bridge for fullscreen and storage", () => {
    const b = fakeBridge();
    vi.stubGlobal("puggieDesktop", b);
    steamAdapter.window.toggleFullscreen();
    expect(b.full).toBe(true);
    expect(steamAdapter.window.isFullscreen()).toBe(true);
    steamAdapter.storage.setItem("k", "v");
    expect(b.data.get("k")).toBe("v");
    expect(steamAdapter.storage.getItem("k")).toBe("v");
    steamAdapter.storage.removeItem("k");
    expect(b.data.has("k")).toBe(false);
  });
  it("steam adapter falls back to browser storage without the shell", () => {
    steamAdapter.storage.setItem("pt-m2", "1");
    expect(window.localStorage.getItem("pt-m2")).toBe("1");
    window.localStorage.removeItem("pt-m2");
  });
});
