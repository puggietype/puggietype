import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ standalone: true }));
vi.mock("../../src/ts/utils/env", () => ({
  isStandalone: () => env.standalone,
  isDevEnvironment: () => true,
}));

import { hasSessionHint, SESSION_HINT_KEY } from "../../src/ts/accounts/flag";
import { isRouteHidden } from "../../src/ts/constants/standalone";
import {
  checkAccountsEnv,
  isAccountsEnabled,
} from "../../vite-plugins/accounts-env";

afterEach(() => {
  vi.unstubAllGlobals();
  env.standalone = true;
});

const ACCOUNT_ROUTES = [
  "/account",
  "/account-settings",
  "/friends",
  "/profile",
  "/profile/:uidOrName",
  "/verify",
];

describe("accounts flag (build env)", () => {
  it("is off unless VITE_FEATURE_ACCOUNTS is exactly 'true'", () => {
    expect(isAccountsEnabled({})).toBe(false);
    for (const value of ["", "false", "0", "1", "TRUE", "yes", "on"]) {
      expect(isAccountsEnabled({ VITE_FEATURE_ACCOUNTS: value }), value).toBe(
        false,
      );
    }
    expect(isAccountsEnabled({ VITE_FEATURE_ACCOUNTS: "true" })).toBe(true);
  });

  it("off by default in tests (the define is unset)", () => {
    const g = globalThis as { __FEATURE_ACCOUNTS__?: boolean };
    expect(g.__FEATURE_ACCOUNTS__).toBeFalsy();
  });
});

describe("accounts flag gating", () => {
  it("off: /login stays hidden in standalone builds", () => {
    expect(isRouteHidden("/login")).toBe(true);
  });

  it("on: only /login comes back; no profiles or other account pages", () => {
    vi.stubGlobal("__FEATURE_ACCOUNTS__", true);
    expect(isRouteHidden("/login")).toBe(false);
    for (const path of ACCOUNT_ROUTES) {
      expect(isRouteHidden(path), path).toBe(true);
    }
    // multiplayer leaderboards (main) are not an account page
    expect(isRouteHidden("/leaderboards")).toBe(false);
  });

  it("on with a backend: /login is not hidden either", () => {
    vi.stubGlobal("__FEATURE_ACCOUNTS__", true);
    env.standalone = false;
    expect(isRouteHidden("/login")).toBe(false);
  });

  it("boot only loads Firebase with a session hint", () => {
    const storage = new Map<string, string>();
    const getItem = (k: string): string | null => storage.get(k) ?? null;
    expect(hasSessionHint({ getItem })).toBe(false);
    storage.set(SESSION_HINT_KEY, "0");
    expect(hasSessionHint({ getItem })).toBe(false);
    storage.set(SESSION_HINT_KEY, "1");
    expect(hasSessionHint({ getItem })).toBe(true);
  });
});

describe("accounts prod build env check", () => {
  const ok = {
    VITE_FEATURE_ACCOUNTS: "true",
    VITE_ACCOUNTS_API_URL: "https://api.example.test",
    VITE_FIREBASE_API_KEY: "k",
    VITE_FIREBASE_AUTH_DOMAIN: "x.firebaseapp.com",
    VITE_FIREBASE_PROJECT_ID: "x",
    VITE_FIREBASE_APP_ID: "a",
  };

  it("passes with everything set and no turnstile key", () => {
    expect(() => checkAccountsEnv(ok)).not.toThrow();
  });

  it("names what is missing", () => {
    expect(() =>
      checkAccountsEnv({ ...ok, VITE_ACCOUNTS_API_URL: "" }),
    ).toThrow(/VITE_ACCOUNTS_API_URL/);
    expect(() =>
      checkAccountsEnv({ ...ok, VITE_FIREBASE_APP_ID: " " }),
    ).toThrow(/VITE_FIREBASE_APP_ID/);
  });

  it("requires https for the API", () => {
    expect(() =>
      checkAccountsEnv({ ...ok, VITE_ACCOUNTS_API_URL: "http://api.test" }),
    ).toThrow(/https/);
  });
});
