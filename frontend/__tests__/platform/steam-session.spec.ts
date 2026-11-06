import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopBridge } from "../../src/ts/platform/desktop-bridge";
import {
  deleteSteamAccount,
  hasSteamSession,
  resumeSteamSession,
  signInWithSteam,
  signInWithSteamTicket,
  signOutSteam,
} from "../../src/ts/platform/steam-identity";
import type { PlatformStorage } from "../../src/ts/platform/types";
import {
  __resetSteamSessionForTests,
  startSilentSteamSignIn,
  steamLaunchState,
} from "../../src/ts/steam/steam-session";

const T1 = "A".repeat(43);
const T2 = "B".repeat(43);
const STEAM_ID = "76561197960287930";

let secure: string | null;
let setCalls: string[];
const storage: PlatformStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function bridge(
  opts: { session?: boolean; secureOk?: boolean; canKeep?: boolean } = {},
): DesktopBridge {
  return {
    version: 1,
    fullscreen: { isFullscreen: () => false, toggle: () => undefined },
    storage,
    steam: {
      signIn: async () => ({ openid: { "openid.mode": "id_res" } }),
      ...(opts.session === false
        ? {}
        : {
            session: {
              get: () => secure,
              set: (t: string) => {
                setCalls.push(t);
                if (opts.secureOk === false) return false;
                secure = t;
                return true;
              },
              clear: () => {
                secure = null;
              },
              ...(opts.canKeep === undefined
                ? {}
                : { canKeep: () => opts.canKeep === true }),
            },
          }),
    },
  };
}

type Reply = { status: number; body?: unknown } | "throw";
type FakeFetch = ReturnType<
  typeof vi.fn<
    (
      url: string,
      init: { body: string },
    ) => Promise<{ status: number; json: () => Promise<unknown> }>
  >
>;
function server(...replies: Reply[]): FakeFetch {
  return vi.fn(async (url: string, init: { body: string }) => {
    void url;
    void init;
    const r = replies.shift() ?? { status: 500 };
    if (r === "throw") throw new Error("offline");
    return { status: r.status, json: async () => r.body ?? null };
  });
}
const deps = (
  b: DesktopBridge,
  fetch: FakeFetch,
): {
  bridge: DesktopBridge;
  serverBase: string;
  storage: PlatformStorage;
  fetch: FakeFetch;
} => ({
  bridge: b,
  serverBase: "https://ws.example",
  storage,
  fetch,
});

beforeEach(() => {
  secure = null;
  setCalls = [];
});

describe("OpenID sign-in keeps the server's session token in secure storage", () => {
  it("stores sessionToken via the shell's safeStorage bridge", async () => {
    const f = server({
      status: 200,
      body: { ok: true, steamId: STEAM_ID, ownsApp: true, sessionToken: T1 },
    });
    const r = await signInWithSteam(deps(bridge(), f));
    expect(r.ok).toBe(true);
    expect(secure).toBe(T1);
  });
  it("stores nothing for a malformed token, or when the server sends none", async () => {
    await signInWithSteam(
      deps(
        bridge(),
        server({
          status: 200,
          body: { ok: true, steamId: STEAM_ID, sessionToken: "x" },
        }),
      ),
    );
    await signInWithSteam(
      deps(
        bridge(),
        server({ status: 200, body: { ok: true, steamId: STEAM_ID } }),
      ),
    );
    expect(setCalls).toEqual([]);
  });
  it("works with an older shell that has no session bridge", async () => {
    const f = server({
      status: 200,
      body: { ok: true, steamId: STEAM_ID, sessionToken: T1 },
    });
    expect(
      (await signInWithSteam(deps(bridge({ session: false }), f))).ok,
    ).toBe(true);
    expect(hasSteamSession(bridge({ session: false }))).toBe(false);
  });
  it("never writes the token to PlatformStorage (localStorage / storage.json)", async () => {
    const spy = vi.spyOn(storage, "setItem");
    await signInWithSteam(
      deps(
        bridge(),
        server({
          status: 200,
          body: { ok: true, steamId: STEAM_ID, sessionToken: T1 },
        }),
      ),
    );
    // only the non-secret "server issues tokens" marker, never the token
    expect(spy.mock.calls).toEqual([["steamSessionsOn", "1"]]);
  });
});

describe("tokens that can't be kept are revoked at once (Legal F2)", () => {
  const ok = { ok: true, steamId: STEAM_ID, ownsApp: true, sessionToken: T1 };
  const body = (f: FakeFetch, i: number): unknown =>
    JSON.parse(f.mock.calls[i]?.[1].body ?? "null");
  it("no secure storage: asks the server not to issue one (keep: false)", async () => {
    const f = server({ status: 200, body: { ok: true, steamId: STEAM_ID } });
    await signInWithSteam(deps(bridge({ canKeep: false }), f));
    expect(body(f, 0)).toMatchObject({ keep: false });
    const g = server({ status: 200, body: { ok: true, steamId: STEAM_ID } });
    await signInWithSteam(deps(bridge({ session: false }), g));
    expect(body(g, 0)).toMatchObject({ keep: false });
    const h = server({ status: 200, body: ok });
    await signInWithSteam(deps(bridge({ canKeep: true }), h));
    expect(body(h, 0)).not.toHaveProperty("keep");
  });
  it("the secure storage check failing counts as can't keep (keep: false)", async () => {
    const b = bridge();
    const session = b.steam?.session;
    if (!session) throw new Error("test bridge has a session");
    session.canKeep = () => {
      throw new Error("safeStorage broken");
    };
    const f = server({ status: 200, body: { ok: true, steamId: STEAM_ID } });
    await signInWithSteam(deps(b, f));
    expect(body(f, 0)).toMatchObject({ keep: false });
  });
  it("set() returns false: POST /steam/session/signout with the issued token", async () => {
    const f = server({ status: 200, body: ok }, { status: 200 });
    expect(
      (await signInWithSteam(deps(bridge({ secureOk: false }), f))).ok,
    ).toBe(true);
    expect(f.mock.calls[1]?.[0]).toBe(
      "https://ws.example/steam/session/signout",
    );
    expect(body(f, 1)).toEqual({ token: T1 });
    expect(secure).toBeNull();
  });
  it("no session bridge (older shell) but a token came anyway: revoked too", async () => {
    const f = server({ status: 200, body: ok }, { status: 200 });
    await signInWithSteam(deps(bridge({ session: false }), f));
    expect(f.mock.calls[1]?.[0]).toBe(
      "https://ws.example/steam/session/signout",
    );
    expect(body(f, 1)).toEqual({ token: T1 });
  });
  it("a failed revoke doesn't fail the sign-in", async () => {
    const f = server({ status: 200, body: ok }, "throw");
    expect(
      (await signInWithSteam(deps(bridge({ secureOk: false }), f))).ok,
    ).toBe(true);
  });
  it("a rotated token that can't be kept is revoked as well", async () => {
    secure = T1;
    const f = server(
      { status: 200, body: { ok: true, steamId: STEAM_ID, sessionToken: T2 } },
      { status: 200 },
    );
    await resumeSteamSession(deps(bridge({ secureOk: false }), f));
    expect(body(f, 1)).toEqual({ token: T2 });
  });
  it("kept tokens are not revoked", async () => {
    const f = server({ status: 200, body: ok });
    await signInWithSteam(deps(bridge(), f));
    expect(f).toHaveBeenCalledTimes(1);
    expect(secure).toBe(T1);
  });
});

describe("resumeSteamSession (silent sign-in)", () => {
  it("none without a kept token; no request", async () => {
    const f = server();
    expect(await resumeSteamSession(deps(bridge(), f))).toEqual({
      ok: false,
      error: "none",
    });
    expect(f).not.toHaveBeenCalled();
  });
  it("rotates: posts the token to /steam/session and keeps the new one", async () => {
    secure = T1;
    const f = server({
      status: 200,
      body: {
        ok: true,
        steamId: STEAM_ID,
        ownsApp: true,
        personaName: "PugFan",
        sessionToken: T2,
      },
    });
    const r = await resumeSteamSession(deps(bridge(), f));
    expect(r).toMatchObject({
      ok: true,
      value: { steamId: STEAM_ID, personaName: "PugFan" },
    });
    expect(f.mock.calls[0]?.[0]).toBe("https://ws.example/steam/session");
    expect(JSON.parse((f.mock.calls[0]?.[1] as { body: string }).body)).toEqual(
      { token: T1 },
    );
    expect(secure).toBe(T2);
  });
  it("401 / 404: deletes the token and falls back to OpenID", async () => {
    for (const status of [401, 404, 400]) {
      secure = T1;
      expect(
        await resumeSteamSession(deps(bridge(), server({ status }))),
      ).toEqual({ ok: false, error: "none" });
      expect(secure).toBeNull();
    }
  });
  it("Steam down (502) keeps the rotated token; offline keeps the old one", async () => {
    secure = T1;
    expect(
      await resumeSteamSession(
        deps(
          bridge(),
          server({ status: 502, body: { ok: false, sessionToken: T2 } }),
        ),
      ),
    ).toEqual({
      ok: false,
      error: "steam_unavailable",
    });
    expect(secure).toBe(T2);
    expect(await resumeSteamSession(deps(bridge(), server("throw")))).toEqual({
      ok: false,
      error: "network",
    });
    expect(secure).toBe(T2);
  });
});

describe("signOutSteam", () => {
  it("deletes the kept token, then tells the server", async () => {
    secure = T1;
    const f = server({ status: 200 });
    await signOutSteam(deps(bridge(), f));
    expect(secure).toBeNull();
    expect(f.mock.calls[0]?.[0]).toBe(
      "https://ws.example/steam/session/signout",
    );
  });
  it("deletes the token even when the server can't be reached", async () => {
    secure = T1;
    await signOutSteam(deps(bridge(), server("throw")));
    expect(secure).toBeNull();
  });
});

describe("deleteSteamAccount", () => {
  it("POST /steam/account/delete with the token, then clears secure storage", async () => {
    secure = T1;
    const f = server({ status: 200, body: { ok: true, deleted: true } });
    expect(await deleteSteamAccount(deps(bridge(), f))).toEqual({ ok: true });
    expect(f.mock.calls[0]?.[0]).toBe(
      "https://ws.example/steam/account/delete",
    );
    expect(JSON.parse((f.mock.calls[0]?.[1] as { body: string }).body)).toEqual(
      { token: T1 },
    );
    expect(secure).toBeNull();
  });
  it("expired token: clears it and asks to sign in again", async () => {
    secure = T1;
    expect(
      await deleteSteamAccount(deps(bridge(), server({ status: 401 }))),
    ).toEqual({ ok: false, error: "expired" });
    expect(secure).toBeNull();
    expect(await deleteSteamAccount(deps(bridge(), server()))).toEqual({
      ok: false,
      error: "expired",
    });
  });
  it("network or server error keeps the token so it can be retried", async () => {
    for (const r of ["throw", { status: 500 }, { status: 429 }] as Reply[]) {
      secure = T1;
      expect(await deleteSteamAccount(deps(bridge(), server(r)))).toEqual({
        ok: false,
        error: "network",
      });
      expect(secure).toBe(T1);
    }
  });
});

describe("startSilentSteamSignIn (at launch)", () => {
  afterEach(() => {
    __resetSteamSessionForTests();
    vi.unstubAllGlobals();
  });
  it("signs in silently once, with the kept token", async () => {
    vi.stubGlobal("puggieDesktop", bridge());
    const value = {
      steamId: STEAM_ID,
      ownsApp: true,
      displayName: null,
      personaName: null,
    };
    const resume = vi.fn(async () => ({ ok: true as const, value }));
    const p = startSilentSteamSignIn(resume);
    expect(steamLaunchState().kind).toBe("resuming");
    await p;
    await startSilentSteamSignIn(resume);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(steamLaunchState()).toEqual({ kind: "signedIn", value });
  });
  it("falls back quietly (OpenID from settings) when the token is refused", async () => {
    vi.stubGlobal("puggieDesktop", bridge());
    await startSilentSteamSignIn(async () => ({ ok: false, error: "none" }));
    expect(steamLaunchState()).toEqual({ kind: "idle" });
  });
  it("does nothing without the shell's session bridge", async () => {
    vi.stubGlobal("puggieDesktop", bridge({ session: false }));
    const resume = vi.fn();
    await startSilentSteamSignIn(resume);
    expect(resume).not.toHaveBeenCalled();
  });
});

describe("signInWithSteamTicket (optional helper)", () => {
  const TICKET = `14000000${"ab".repeat(120)}`;
  const withTicket = (
    t: () => Promise<{ ticket: string } | null>,
  ): DesktopBridge => {
    const b = bridge();
    if (b.steam) b.steam.ticket = t;
    return b;
  };
  it("posts the hex ticket to /steam/ticket and keeps the issued token", async () => {
    const f = server({
      status: 200,
      body: { ok: true, steamId: STEAM_ID, ownsApp: true, sessionToken: T1 },
    });
    const r = await signInWithSteamTicket(
      deps(
        withTicket(async () => ({ ticket: TICKET })),
        f,
      ),
    );
    expect(r).toMatchObject({ ok: true, value: { steamId: STEAM_ID } });
    expect(f.mock.calls[0]?.[0]).toBe("https://ws.example/steam/ticket");
    expect(JSON.parse(f.mock.calls[0]?.[1].body ?? "")).toEqual({
      ticket: TICKET,
    });
    expect(secure).toBe(T1);
  });
  it("any failure is 'none' (no helper, null, bad output, throw, 401, 404, offline)", async () => {
    const ok = async (): Promise<{ ticket: string }> => ({ ticket: TICKET });
    const cases: [DesktopBridge, FakeFetch][] = [
      [bridge(), server()],
      [withTicket(async () => null), server()],
      [withTicket(async () => ({ ticket: "nothex" })), server()],
      [withTicket(async () => Promise.reject(new Error("x"))), server()],
      [withTicket(ok), server({ status: 401, body: { ok: false } })],
      [withTicket(ok), server({ status: 404 })],
      [withTicket(ok), server("throw")],
    ];
    for (const [b, f] of cases) {
      expect(await signInWithSteamTicket(deps(b, f))).toEqual({
        ok: false,
        error: "none",
      });
    }
  });
});

describe("launch order (Legal C37-1): kept token, then ticket, then OpenID", () => {
  afterEach(() => {
    __resetSteamSessionForTests();
    vi.unstubAllGlobals();
  });
  const value = {
    steamId: STEAM_ID,
    ownsApp: true,
    displayName: null,
    personaName: null,
  };
  const none = async (): Promise<{ ok: false; error: "none" }> => ({
    ok: false,
    error: "none",
  });
  function withHelper(): ReturnType<typeof vi.fn> {
    const b = bridge();
    const helper = vi.fn(async () => ({
      ticket: `14000000${"ab".repeat(120)}`,
    }));
    if (b.steam) b.steam.ticket = helper;
    vi.stubGlobal("puggieDesktop", b);
    return helper;
  }
  it("a kept token that works: the helper is never spawned", async () => {
    const helper = withHelper();
    secure = T1;
    const resume = vi.fn(async () => ({ ok: true as const, value }));
    await startSilentSteamSignIn(resume); // the real ticket step
    expect(resume).toHaveBeenCalledTimes(1);
    expect(helper).not.toHaveBeenCalled();
    expect(steamLaunchState()).toEqual({ kind: "signedIn", value });
  });
  it("a token still kept after a failed resume (server unreachable): no ticket, no new token family", async () => {
    const helper = withHelper();
    secure = T1;
    await startSilentSteamSignIn(none);
    expect(helper).not.toHaveBeenCalled();
    expect(secure).toBe(T1);
    expect(steamLaunchState()).toEqual({ kind: "idle" });
  });
  it("no kept token (or one the server rejected and resume cleared): the ticket", async () => {
    withHelper();
    secure = null;
    const ticket = vi.fn(async () => ({ ok: true as const, value }));
    await startSilentSteamSignIn(none, ticket);
    expect(ticket).toHaveBeenCalledTimes(1);
    expect(steamLaunchState()).toEqual({ kind: "signedIn", value });
  });
  it("both fail: idle (the OpenID button)", async () => {
    withHelper();
    secure = null;
    await startSilentSteamSignIn(none, none);
    expect(steamLaunchState()).toEqual({ kind: "idle" });
  });
});
