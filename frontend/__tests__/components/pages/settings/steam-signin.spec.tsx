import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/ts/utils/json-data", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../src/ts/utils/json-data")>();
  return {
    ...actual,
    getLayout: async (): Promise<Record<string, never>> => ({}),
  };
});
vi.mock("../../../../src/ts/utils/file-storage", () => ({
  default: {
    track: (): number => 0,
    hasFile: async (): Promise<boolean> => false,
    deleteFile: async (): Promise<void> => undefined,
  },
}));

import type { SteamBridgeSignInResult } from "../../../../src/ts/platform/desktop-bridge";

import {
  STEAM_SIGNIN_ERROR_TEXT,
  SteamSignIn,
} from "../../../../src/ts/components/pages/settings/custom-setting/SteamSignIn";
import { SettingsPage } from "../../../../src/ts/components/pages/settings/SettingsPage";
import { steamAdapter } from "../../../../src/ts/platform/steam";
import {
  STEAM_NAME_HIDDEN_KEY,
  STEAM_SIGNIN_HINT,
} from "../../../../src/ts/platform/steam-identity";

// Legal M3-HINT, exact copy
const HINT =
  "Steam will show this sign-in as coming from 127.0.0.1 (your own computer).";
const OPENID = { "openid.mode": "id_res", "openid.sig": "x" };

let store: Map<string, string>;
let signIn: ReturnType<typeof vi.fn<() => Promise<SteamBridgeSignInResult>>>;

function installBridge(opts: {
  steam: boolean;
  result?: SteamBridgeSignInResult;
}): void {
  signIn = vi.fn(async () =>
    "result" in opts
      ? (opts.result as SteamBridgeSignInResult)
      : { openid: OPENID },
  );
  vi.stubGlobal("puggieDesktop", {
    version: 1,
    fullscreen: { isFullscreen: () => false, toggle: () => undefined },
    storage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    ...(opts.steam ? { steam: { signIn } } : {}),
  });
}

function server(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const f = vi.fn(async () => ({ status, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
}

const $ = (el: HTMLElement, sel: string): HTMLElement | null =>
  el.querySelector<HTMLElement>(sel);

function press(el: HTMLElement, sel: string): void {
  const target = $(el, sel);
  if (target === null) throw new Error(`missing ${sel}`);
  fireEvent.click(target);
}

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("__PLATFORM__", "steam");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Sign in with Steam: visibility", () => {
  it("shows a plain text button on the steam build with the flag on", () => {
    installBridge({ steam: true });
    const el = render(() => <SteamSignIn />).container;
    const btn = $(el, "#steam-signin-button");
    expect(btn?.textContent).toBe("Sign in with Steam");
    // plain text label: no logo, image or icon inside the button
    expect(btn?.querySelector("img, svg, i")).toBeNull();
    expect($(el, '[data-testid="steam-name-hidden"]')).not.toBeNull();
  });

  it("is absent on the steam build with the flag off (no steam bridge)", () => {
    installBridge({ steam: false });
    const el = render(() => <SteamSignIn />).container;
    expect($(el, "#steam-signin-button")).toBeNull();
    expect($(el, '[data-testid="steam-name-hidden"]')).toBeNull();
  });

  it("is absent from the settings page on web, even with a steam bridge", () => {
    vi.unstubAllGlobals();
    installBridge({ steam: true });
    const el = render(() => <SettingsPage />).container;
    expect($(el, "#steam-signin-button")).toBeNull();
    expect($(el, '[data-testid="steam-signin"]')).toBeNull();
    expect(el.textContent).not.toContain("steam account");
  });

  it("is in the settings page on steam with the flag on", () => {
    installBridge({ steam: true });
    const el = render(() => <SettingsPage />).container;
    expect($(el, "#steam-signin-button")).not.toBeNull();
  });
});

describe("Sign in with Steam: hint before the browser opens (M3-HINT)", () => {
  it("shows the exact hint and opens Steam only after continue", async () => {
    expect(STEAM_SIGNIN_HINT).toBe(HINT);
    installBridge({ steam: true });
    server(200, { ok: true, steamId: "1", ownsApp: true, personaName: null });
    const el = render(() => <SteamSignIn />).container;
    press(el, "#steam-signin-button");
    const dialog = $(el, '[data-testid="steam-signin-hint"]');
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect($(el, "#steam-signin-hint-text")?.textContent).toBe(HINT);
    expect(signIn).not.toHaveBeenCalled();
    press(el, "#steam-signin-continue");
    expect(signIn).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect($(el, '[data-testid="steam-signin-signed-in"]')).not.toBeNull(),
    );
  });

  it("cancel on the hint never opens Steam", () => {
    installBridge({ steam: true });
    const el = render(() => <SteamSignIn />).container;
    press(el, "#steam-signin-button");
    press(el, "#steam-signin-back");
    expect(signIn).not.toHaveBeenCalled();
    expect($(el, "#steam-signin-button")).not.toBeNull();
  });
});

async function signInVia(
  result: SteamBridgeSignInResult,
  status = 200,
  body: unknown = {
    ok: true,
    steamId: "1",
    ownsApp: true,
    personaName: "PugFan",
  },
): Promise<HTMLElement> {
  installBridge({ steam: true, result });
  server(status, body);
  const el = render(() => <SteamSignIn />).container;
  press(el, "#steam-signin-button");
  press(el, "#steam-signin-continue");
  await waitFor(() =>
    expect($(el, '[data-testid="steam-signin-pending"]')).toBeNull(),
  );
  return el;
}

// Legal approval of PR #27, exact copy
const DESCRIPTION =
  "Sign in with your Steam account. PuggieType receives your Steam ID, whether you own PuggieType and its supporter pack, and your Steam display name. We don't store any of these; see our privacy policy.";
const CANCELLED = "Sign-in was cancelled or couldn't finish. Please try again.";
const NOT_VERIFIED =
  "We couldn't verify this sign-in with Steam. Please try again.";

describe("Sign in with Steam: Legal copy", () => {
  it("uses the approved strings", () => {
    expect(STEAM_SIGNIN_ERROR_TEXT.cancelled).toBe(CANCELLED);
    expect(STEAM_SIGNIN_ERROR_TEXT.not_verified).toBe(NOT_VERIFIED);
  });

  it("shows the exact description with privacy policy linked to /privacy", () => {
    installBridge({ steam: true });
    const el = render(() => <SteamSignIn />).container;
    const d = $(el, '[data-testid="steam-signin-description"]');
    expect(d?.textContent?.replace(/\s+/g, " ").trim()).toBe(DESCRIPTION);
    const link = d?.querySelector("a");
    expect(link?.textContent).toBe("privacy policy");
    expect(link?.getAttribute("href")).toBe("/privacy");
  });

  it.each([
    ["shell failed", { error: "failed" }],
    ["shell cancelled", { error: "cancelled" }],
  ] as const)("%s shows the cancelled copy", async (_, result) => {
    const el = await signInVia(result);
    expect($(el, '[data-testid="steam-signin-error"]')?.textContent).toBe(
      CANCELLED,
    );
  });

  it("a thrown shell error shows the cancelled copy", async () => {
    installBridge({ steam: true });
    signIn.mockRejectedValueOnce(new Error("ipc gone"));
    server(200, {});
    const el = render(() => <SteamSignIn />).container;
    press(el, "#steam-signin-button");
    press(el, "#steam-signin-continue");
    await waitFor(() =>
      expect($(el, '[data-testid="steam-signin-error"]')?.textContent).toBe(
        CANCELLED,
      ),
    );
  });

  it.each([500, 429, 401])(
    "server %i shows the not verified copy",
    async (status) => {
      const el = await signInVia({ openid: OPENID }, status, { ok: false });
      expect($(el, '[data-testid="steam-signin-error"]')?.textContent).toBe(
        NOT_VERIFIED,
      );
    },
  );
});

describe("Sign in with Steam: states", () => {
  it("success shows the persona name the server returned", async () => {
    const el = await signInVia({ openid: OPENID });
    expect($(el, '[data-testid="steam-signin-name"]')?.textContent).toBe(
      "PugFan",
    );
    press(el, "#steam-signout");
    expect($(el, "#steam-signin-button")).not.toBeNull();
  });

  it("success without a name (server returned none) shows no name", async () => {
    const el = await signInVia({ openid: OPENID }, 200, {
      ok: true,
      steamId: "1",
      ownsApp: true,
      personaName: null,
    });
    expect($(el, '[data-testid="steam-signin-signed-in"]')?.textContent).toBe(
      "Signed in with Steam.",
    );
    expect($(el, '[data-testid="steam-signin-name"]')).toBeNull();
  });

  it.each([
    ["cancelled (old shell: null)", null, "cancelled"],
    ["cancelled", { error: "cancelled" }, "cancelled"],
    ["timeout", { error: "timeout" }, "timeout"],
    ["busy", { error: "busy" }, "busy"],
  ] as const)("%s", async (_, result, error) => {
    const el = await signInVia(result);
    expect($(el, '[data-testid="steam-signin-error"]')?.textContent).toBe(
      STEAM_SIGNIN_ERROR_TEXT[error],
    );
    expect($(el, "#steam-signin-button")).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("server 404 (feature off) shows that sign-in isn't available", async () => {
    const el = await signInVia({ openid: OPENID }, 404, "Not Found");
    expect($(el, '[data-testid="steam-signin-error"]')?.textContent).toBe(
      STEAM_SIGNIN_ERROR_TEXT.feature_off,
    );
  });

  it("a rejected sign-in shows not verified", async () => {
    const el = await signInVia({ openid: OPENID }, 401, { ok: false });
    expect($(el, '[data-testid="steam-signin-error"]')?.textContent).toBe(
      STEAM_SIGNIN_ERROR_TEXT.not_verified,
    );
  });

  it("never grants entitlements from the client", async () => {
    await signInVia({ openid: OPENID });
    expect(await steamAdapter.entitlements.getOwned()).toEqual([]);
  });
});

describe("Sign in with Steam: hide name", () => {
  it("hides and shows the name and stores the choice", async () => {
    const el = await signInVia({ openid: OPENID });
    expect($(el, '[data-testid="steam-signin-name"]')).not.toBeNull();
    press(el, "#steam-name-hidden-on");
    expect(store.get(STEAM_NAME_HIDDEN_KEY)).toBe("1");
    expect($(el, '[data-testid="steam-signin-name"]')).toBeNull();
    expect(el.textContent).not.toContain("PugFan");
    press(el, "#steam-name-hidden-off");
    expect(store.has(STEAM_NAME_HIDDEN_KEY)).toBe(false);
    expect($(el, '[data-testid="steam-signin-name"]')?.textContent).toBe(
      "PugFan",
    );
  });

  it("starts hidden when the setting is stored", async () => {
    store = new Map([[STEAM_NAME_HIDDEN_KEY, "1"]]);
    installBridge({ steam: true });
    server(200, {
      ok: true,
      steamId: "1",
      ownsApp: true,
      personaName: "PugFan",
    });
    const el = render(() => <SteamSignIn />).container;
    expect($(el, "#steam-name-hidden-on")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("web build parity", () => {
  it("SteamSignIn is only rendered behind the inline __PLATFORM__ steam check", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.resolve(
        __dirname,
        "../../../../src/ts/components/pages/settings/SettingsPage.tsx",
      ),
      "utf8",
    );
    const uses = src.match(/<SteamSignIn\b/g) ?? [];
    expect(uses).toHaveLength(1);
    const guard =
      'typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam" ? (\n              <Section title="steam account" tab="gameplay">\n                <SteamSignIn />';
    expect(src).toContain(guard);
  });
});
