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

  it("is absent from the settings page on web, even with a steam bridge", async () => {
    vi.unstubAllGlobals();
    installBridge({ steam: true });
    vi.resetModules();
    const { SettingsPage: Page } =
      await import("../../../../src/ts/components/pages/settings/SettingsPage");
    const el = render(() => <Page />).container;
    expect($(el, "#steam-signin-button")).toBeNull();
    expect($(el, '[data-testid="steam-signin"]')).toBeNull();
    expect(el.textContent).not.toContain("steam account");
  }, 30_000);

  it("is in the settings page on steam with the flag on", async () => {
    installBridge({ steam: true });
    vi.resetModules();
    const { SettingsPage: Page } =
      await import("../../../../src/ts/components/pages/settings/SettingsPage");
    const el = render(() => <Page />).container;
    await waitFor(() => expect($(el, "#steam-signin-button")).not.toBeNull());
  }, 30_000);
});

describe("Sign in with Steam: hint before the browser opens (M3-HINT)", () => {
  it("shows the exact hint and opens Steam only after continue", async () => {
    expect(STEAM_SIGNIN_HINT).toBe(HINT);
    installBridge({ steam: true });
    server(200, { ok: true, steamId: "1", ownsApp: true, personaName: null });
    const el = render(() => <SteamSignIn />).container;
    press(el, "#steam-signin-button");
    const dialog = $(el, '[data-testid="steam-signin-hint"]');
    // SR-ANNOUNCE: the hint is read via continue's aria-describedby (focus
    // moves there), not as a second live region
    expect(dialog).not.toBeNull();
    expect(dialog?.hasAttribute("aria-live")).toBe(false);
    expect(
      $(el, "#steam-signin-continue")?.getAttribute("aria-describedby"),
    ).toBe("steam-signin-hint-text");
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
    // no static import; lazily imported only behind the inline steam check
    expect(src).not.toMatch(/^import .*SteamSignIn/m);
    expect(src).toMatch(
      /typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam"\s*\?\s*lazy\(async \(\) => \(\{\s*default: \(await import\("\.\/custom-setting\/SteamSignIn"\)\)/,
    );
    expect(src.match(/<SteamSignIn\b/g)).toHaveLength(1);
  });
});

describe("Sign in with Steam: focus (QA P2 A11Y)", () => {
  it("moves focus to continue when the hint opens, back to the button on cancel", () => {
    installBridge({ steam: true });
    const el = render(() => <SteamSignIn />, {
      container: document.body.appendChild(document.createElement("div")),
    }).container;
    press(el, "#steam-signin-button");
    expect(document.activeElement?.id).toBe("steam-signin-continue");
    press(el, "#steam-signin-back");
    expect(document.activeElement?.id).toBe("steam-signin-button");
  });

  it("focuses the waiting status after continue, then sign out; sign out returns to the button", async () => {
    let finish: (r: SteamBridgeSignInResult) => void = () => undefined;
    installBridge({ steam: true });
    signIn.mockImplementationOnce(
      async () => new Promise<SteamBridgeSignInResult>((res) => (finish = res)),
    );
    server(200, {
      ok: true,
      steamId: "1",
      ownsApp: true,
      personaName: "PugFan",
    });
    const el = render(() => <SteamSignIn />, {
      container: document.body.appendChild(document.createElement("div")),
    }).container;
    press(el, "#steam-signin-button");
    press(el, "#steam-signin-continue");
    expect(document.activeElement?.id).toBe("steam-signin-pending");
    finish({ openid: OPENID });
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("steam-signout"),
    );
    press(el, "#steam-signout");
    expect(document.activeElement?.id).toBe("steam-signin-button");
  });

  it("an error returns focus to the sign-in button", async () => {
    const el = await signInVia({ error: "timeout" });
    expect(el.isConnected).toBe(true);
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("steam-signin-button"),
    );
  });
});

describe("Sign in with Steam: screen reader announcements (SR-ANNOUNCE)", () => {
  const mount = (): HTMLElement =>
    render(() => <SteamSignIn />, {
      container: document.body.appendChild(document.createElement("div")),
    }).container;

  it("continue is described by the hint text", () => {
    installBridge({ steam: true });
    const el = mount();
    press(el, "#steam-signin-button");
    const cont = $(el, "#steam-signin-continue");
    expect(cont?.getAttribute("aria-describedby")).toBe(
      "steam-signin-hint-text",
    );
    expect(document.getElementById("steam-signin-hint-text")?.textContent).toBe(
      STEAM_SIGNIN_HINT,
    );
  });

  it("has exactly one live region, mounted before anything happens", () => {
    installBridge({ steam: true });
    const el = mount();
    const live = el.querySelectorAll(
      "[aria-live], [role='status'], [role='alert']",
    );
    expect(live).toHaveLength(1);
    const region = live[0] as HTMLElement;
    expect(region.id).toBe("steam-signin-status");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.textContent).toBe("");
  });

  it("the same region element carries pending, then signed-in text", async () => {
    let finish: (r: SteamBridgeSignInResult) => void = () => undefined;
    installBridge({ steam: true });
    signIn.mockImplementationOnce(
      async () => new Promise<SteamBridgeSignInResult>((res) => (finish = res)),
    );
    server(200, {
      ok: true,
      steamId: "1",
      ownsApp: true,
      personaName: "PugFan",
    });
    const el = mount();
    const region = $(el, "#steam-signin-status");
    press(el, "#steam-signin-button");
    expect($(el, "#steam-signin-status")).toBe(region);
    expect(region?.textContent).toBe("");
    press(el, "#steam-signin-continue");
    expect($(el, "#steam-signin-status")).toBe(region);
    expect(region?.textContent).toBe("Waiting for Steam in your browser...");
    finish({ openid: OPENID });
    await waitFor(() =>
      expect(region?.textContent).toBe("Signed in with Steam as PugFan."),
    );
    expect($(el, "#steam-signin-status")).toBe(region);
    expect(el.querySelectorAll("[aria-live], [role='status']")).toHaveLength(1);
    press(el, "#steam-signout");
    expect($(el, "#steam-signin-status")).toBe(region);
    expect(region?.textContent).toBe("");
  });

  it("the same region element carries the error text", async () => {
    installBridge({ steam: true, result: { error: "timeout" } });
    const el = mount();
    const region = $(el, "#steam-signin-status");
    press(el, "#steam-signin-button");
    press(el, "#steam-signin-continue");
    await waitFor(() =>
      expect(region?.textContent).toBe(STEAM_SIGNIN_ERROR_TEXT.timeout),
    );
    expect($(el, "#steam-signin-status")).toBe(region);
    expect(el.querySelectorAll("[aria-live], [role='status']")).toHaveLength(1);
    expect($(el, "#steam-signin-button")).not.toBeNull();
  });
});

describe("Sign in with Steam: rendered attributes (SR-ANNOUNCE review)", () => {
  it("continue has the real aria-describedby attribute, not data-aria-describedby", () => {
    installBridge({ steam: true });
    const el = render(() => <SteamSignIn />).container;
    press(el, "#steam-signin-button");
    const cont = $(el, "#steam-signin-continue");
    expect(cont?.getAttributeNames()).toContain("aria-describedby");
    expect(cont?.getAttributeNames()).not.toContain("data-aria-describedby");
    expect(cont?.outerHTML).toMatch(
      / aria-describedby="steam-signin-hint-text"/,
    );
    expect(cont?.dataset["ariaDescribedby"]).toBeUndefined();
  });

  it("empty region: the next control is pulled up; with text it is not (computed style)", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const css = readFileSync(
      path.resolve(
        __dirname,
        "../../../../src/ts/components/pages/settings/custom-setting/steam-signin.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/display:\s*none/);
    const style = document.head.appendChild(document.createElement("style"));
    style.textContent = css;
    try {
      installBridge({ steam: true, result: { error: "timeout" } });
      const el = render(() => <SteamSignIn />, {
        container: document.body.appendChild(document.createElement("div")),
      }).container;
      const region = $(el, "#steam-signin-status");
      const next = (): Element | null | undefined => region?.nextElementSibling;
      expect(region?.matches(":empty")).toBe(true);
      expect(region?.hidden).toBe(false);
      expect(next()?.matches("#steam-signin-status:empty + *")).toBe(true);
      expect(getComputedStyle(next() as Element).marginTop).toBe("-0.5rem");
      press(el, "#steam-signin-button");
      press(el, "#steam-signin-continue");
      await waitFor(() =>
        expect(region?.textContent).toBe(STEAM_SIGNIN_ERROR_TEXT.timeout),
      );
      expect(region?.matches(":empty")).toBe(false);
      expect(next()?.matches("#steam-signin-status:empty + *")).toBe(false);
      expect(getComputedStyle(next() as Element).marginTop).not.toBe("-0.5rem");
    } finally {
      style.remove();
    }
  });
});
