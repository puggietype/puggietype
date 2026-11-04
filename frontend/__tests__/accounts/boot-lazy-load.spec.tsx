import { render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// a factory runs when its module is first imported, so a flag set here means
// boot (or something it pulled in) loaded that module. vi.doMock per test:
// vi.mock factories run once per file, even across vi.resetModules
const loaded = {
  sdk: false,
  firebaseApp: false,
  firebaseAuth: false,
  turnstile: false,
};

function mockLoadDetectors(): void {
  loaded.sdk = false;
  loaded.firebaseApp = false;
  loaded.firebaseAuth = false;
  loaded.turnstile = false;
  vi.doMock("../../src/ts/accounts/firebase-sdk", () => {
    loaded.sdk = true;
    return {
      getRestoredUser: vi.fn(async () => null),
      getUserIdToken: vi.fn(async () => "id-token"),
      signOutFirebase: vi.fn(async () => undefined),
    };
  });
  vi.doMock("firebase/app", () => {
    loaded.firebaseApp = true;
    return {};
  });
  vi.doMock("firebase/auth", () => {
    loaded.firebaseAuth = true;
    return {};
  });
  vi.doMock("../../src/ts/accounts/turnstile", () => {
    loaded.turnstile = true;
    return { loadTurnstile: vi.fn() };
  });
}

vi.mock("../../src/ts/accounts/config", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../src/ts/accounts/config")>();
  return {
    ...real,
    getAccountsConfig: () =>
      real.parseAccountsConfig({
        VITE_ACCOUNTS_API_URL: "https://api.example.test",
        VITE_TURNSTILE_SITE_KEY: "site-key",
        VITE_FIREBASE_API_KEY: "k",
        VITE_FIREBASE_AUTH_DOMAIN: "x.firebaseapp.com",
        VITE_FIREBASE_PROJECT_ID: "x",
        VITE_FIREBASE_APP_ID: "a",
      }),
  };
});

import { SESSION_HINT_KEY } from "../../src/ts/accounts/flag";

const FIREBASE_HOSTS =
  /googleapis\.com|identitytoolkit|securetoken|firebaseapp\.com|gstatic\.com\/firebasejs/;
const TURNSTILE_HOST = "challenges.cloudflare.com";

let requests: string[] = [];

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return String(input);
}

function scriptSrcs(): string[] {
  return [...document.querySelectorAll("script[src], link[href]")].map(
    (el) => el.getAttribute("src") ?? el.getAttribute("href") ?? "",
  );
}

/** what index.tsx does with the flag on, plus the nav button every page has */
async function boot(path: string): Promise<void> {
  history.replaceState(null, "", path);
  const { initAccounts } = await import("../../src/ts/accounts/boot");
  const { AccountsNavButton } =
    await import("../../src/ts/accounts/ui/AccountsNavButton");
  render(() => <AccountsNavButton />);
  await initAccounts();
  // let any stray import()/microtasks settle
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("__FEATURE_ACCOUNTS__", true);
  mockLoadDetectors();
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      requests.push(urlOf(input));
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
      });
    }),
  );
  vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(function (
    this: XMLHttpRequest,
    _method: string,
    url: string | URL,
  ) {
    requests.push(urlOf(url));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  document.head.innerHTML = "";
  history.replaceState(null, "", "/");
});

describe("accounts boot, signed-out visitor", () => {
  for (const path of ["/", "/settings", "/about"]) {
    it(`${path}: no Firebase SDK, no Firebase requests, no Turnstile`, async () => {
      await boot(path);

      expect(loaded.sdk).toBe(false);
      expect(loaded.firebaseApp).toBe(false);
      expect(loaded.firebaseAuth).toBe(false);
      expect(loaded.turnstile).toBe(false);

      const urls = [...requests, ...scriptSrcs()];
      expect(urls.filter((u) => FIREBASE_HOSTS.test(u))).toEqual([]);
      expect(urls.filter((u) => u.includes(TURNSTILE_HOST))).toEqual([]);
      expect(
        (window as { turnstile?: unknown }).turnstile,
        "turnstile global",
      ).toBeUndefined();
    });
  }

  it("a non-'1' hint still counts as signed out", async () => {
    localStorage.setItem(SESSION_HINT_KEY, "0");
    await boot("/");
    expect(loaded.sdk).toBe(false);
  });
});

describe("accounts boot, returning signed-in user", () => {
  it("with the session hint, boot may load the Firebase SDK", async () => {
    localStorage.setItem(SESSION_HINT_KEY, "1");
    await boot("/");
    expect(loaded.sdk).toBe(true);
    // restoring a session never needs a captcha
    expect(loaded.turnstile).toBe(false);
  });
});
