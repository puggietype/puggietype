import { describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../src/ts/platform/desktop-bridge";
import { steamAdapter } from "../../src/ts/platform/steam";
import {
  isSteamNameHidden,
  setSteamNameHidden,
  signInWithSteam,
  steamDisplayName,
} from "../../src/ts/platform/steam-identity";
import type { PlatformStorage } from "../../src/ts/platform/types";

function memStorage(): PlatformStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const OPENID = { "openid.mode": "id_res", "openid.sig": "x" };

type SignIn = () => Promise<{ openid: Record<string, string> } | null>;
function bridge(result: { openid: Record<string, string> } | null): {
  b: DesktopBridge;
  signIn: SignIn;
} {
  const signIn = vi.fn(async () => result);
  const b = {
    version: 1,
    fullscreen: { isFullscreen: () => false, toggle: () => undefined },
    storage: memStorage(),
    steam: { signIn },
  } as DesktopBridge;
  return { b, signIn };
}

function server(
  status: number,
  body: unknown,
): () => Promise<{ status: number; json: () => Promise<unknown> }> {
  return vi.fn(async () => ({ status, json: async () => body }));
}

describe("steamDisplayName (web name filter)", () => {
  it("passes a clean persona name", () => {
    expect(steamDisplayName("PugFan", false)).toBe("PugFan");
  });
  it("drops names the web username filter rejects", () => {
    expect(steamDisplayName("bitly_fan", false)).toBeNull();
    expect(steamDisplayName("has spaces", false)).toBeNull();
    expect(steamDisplayName("x".repeat(17), false)).toBeNull();
    expect(steamDisplayName("", false)).toBeNull();
  });
  it("can be hidden", () => {
    expect(steamDisplayName("PugFan", true)).toBeNull();
    const s = memStorage();
    expect(isSteamNameHidden(s)).toBe(false);
    setSteamNameHidden(s, true);
    expect(isSteamNameHidden(s)).toBe(true);
    setSteamNameHidden(s, false);
    expect(isSteamNameHidden(s)).toBe(false);
  });
});

describe("signInWithSteam", () => {
  it("is unavailable without the shell's steam bridge", async () => {
    expect(
      await signInWithSteam({
        bridge: undefined,
        serverBase: "https://ws.example",
        storage: memStorage(),
      }),
    ).toEqual({ ok: false, error: "unavailable" });
  });

  it("forwards the openid response to POST /steam/auth and filters the name", async () => {
    const { b } = bridge({ openid: OPENID });
    const fetch = server(200, {
      ok: true,
      steamId: "76561197960287930",
      ownsApp: true,
      personaName: "PugFan",
    });
    const r = await signInWithSteam({
      bridge: b,
      serverBase: "https://ws.example/",
      storage: memStorage(),
      fetch,
    });
    expect(r).toEqual({
      ok: true,
      value: {
        steamId: "76561197960287930",
        ownsApp: true,
        displayName: "PugFan",
      },
    });
    expect(fetch).toHaveBeenCalledWith("https://ws.example/steam/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ openid: OPENID }),
    });
  });

  it("hides the name when the player chose to", async () => {
    const { b } = bridge({ openid: OPENID });
    const storage = memStorage();
    setSteamNameHidden(storage, true);
    const r = await signInWithSteam({
      bridge: b,
      serverBase: "https://ws.example",
      storage,
      fetch: server(200, {
        ok: true,
        steamId: "1",
        ownsApp: false,
        personaName: "PugFan",
      }),
    });
    expect(r).toMatchObject({
      ok: true,
      value: { ownsApp: false, displayName: null },
    });
  });

  it("maps cancel, rejection, Steam outage and network errors", async () => {
    const storage = memStorage();
    const base = "https://ws.example";
    expect(
      await signInWithSteam({
        bridge: bridge(null).b,
        serverBase: base,
        storage,
      }),
    ).toEqual({ ok: false, error: "cancelled" });
    const b = bridge({ openid: OPENID }).b;
    expect(
      await signInWithSteam({
        bridge: b,
        serverBase: base,
        storage,
        fetch: server(401, { ok: false, error: "not_verified" }),
      }),
    ).toEqual({ ok: false, error: "not_verified" });
    expect(
      await signInWithSteam({
        bridge: b,
        serverBase: base,
        storage,
        fetch: server(502, { ok: false, error: "steam_unavailable" }),
      }),
    ).toEqual({ ok: false, error: "steam_unavailable" });
    expect(
      await signInWithSteam({
        bridge: b,
        serverBase: base,
        storage,
        fetch: vi.fn(async () => {
          throw new Error("offline");
        }),
      }),
    ).toEqual({ ok: false, error: "network" });
  });
});

describe("steam adapter identity", () => {
  it("is available only when the shell exposes steam sign-in", () => {
    expect(steamAdapter.identity.isAvailable()).toBe(false);
    vi.stubGlobal("puggieDesktop", bridge(null).b);
    expect(steamAdapter.identity.isAvailable()).toBe(true);
    vi.unstubAllGlobals();
  });
});
