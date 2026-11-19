import { describe, expect, it } from "vitest";

import {
  missingAccountsConfig,
  parseAccountsConfig,
} from "../../src/ts/accounts/config";

describe("accounts config", () => {
  it("is empty (and reports what is missing) by default", () => {
    const config = parseAccountsConfig({});
    expect(config.turnstileSiteKey).toBe("");
    expect(config.apiUrl).toBe("");
    expect(missingAccountsConfig(config)).toEqual([
      "VITE_ACCOUNTS_API_URL",
      "VITE_FIREBASE_API_KEY",
      "VITE_FIREBASE_AUTH_DOMAIN",
      "VITE_FIREBASE_PROJECT_ID",
      "VITE_FIREBASE_APP_ID",
    ]);
  });

  it("reads and trims the build env", () => {
    const config = parseAccountsConfig({
      VITE_ACCOUNTS_API_URL: " https://api.example.test/ ",
      VITE_TURNSTILE_SITE_KEY: "site",
      VITE_FIREBASE_API_KEY: "k",
      VITE_FIREBASE_AUTH_DOMAIN: "x.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "x",
      VITE_FIREBASE_APP_ID: "1:2:web:3",
      DEV: true,
    });
    expect(config).toEqual({
      apiUrl: "https://api.example.test",
      turnstileSiteKey: "site",
      firebase: {
        apiKey: "k",
        authDomain: "x.firebaseapp.com",
        projectId: "x",
        appId: "1:2:web:3",
      },
    });
    expect(missingAccountsConfig(config)).toEqual([]);
  });

  it("does not need a turnstile key to be usable", () => {
    const config = parseAccountsConfig({
      VITE_ACCOUNTS_API_URL: "https://api.example.test",
      VITE_FIREBASE_API_KEY: "k",
      VITE_FIREBASE_AUTH_DOMAIN: "x.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "x",
      VITE_FIREBASE_APP_ID: "a",
    });
    expect(missingAccountsConfig(config)).toEqual([]);
  });
});
