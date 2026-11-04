import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { accountsCspSources } from "../../vite-plugins/accounts-env";
import { shouldStubFirebase } from "../../vite-plugins/firebase-stub";
import { addCspSources, renderHeaders } from "../../vite-plugins/pages-headers";

const template = readFileSync(
  path.resolve(__dirname, "../../static/_headers"),
  "utf8",
);
const values = { scriptHashes: ["'sha256-x'"], wsOrigin: "wss://ws.test" };
const csp = (headers: string): string =>
  (
    headers.split("\n").find((l) => l.includes("Content-Security-Policy")) ?? ""
  ).replace(/^\s*Content-Security-Policy:/, "");
const directive = (headers: string, name: string): string =>
  csp(headers)
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `)) ?? "";

describe("firebase stub (standalone builds)", () => {
  const sdk = "/repo/frontend/src/ts/accounts/firebase-sdk.ts";
  it("accounts off: stubs firebase/app and firebase/auth for everyone", () => {
    expect(shouldStubFirebase("firebase/app", sdk, undefined)).toBe(true);
    expect(shouldStubFirebase("firebase/auth", "/x/auth.tsx", undefined)).toBe(
      true,
    );
  });
  it("accounts on: only the lazy sdk module gets the real SDK", () => {
    expect(shouldStubFirebase("firebase/auth", sdk, sdk)).toBe(false);
    expect(shouldStubFirebase("firebase/app", `${sdk}?v=1`, sdk)).toBe(false);
    expect(shouldStubFirebase("firebase/auth", "/x/firebase.ts", sdk)).toBe(
      true,
    );
  });
  it("leaves other ids alone", () => {
    expect(shouldStubFirebase("firebase/firestore", "/x", undefined)).toBe(
      false,
    );
    expect(shouldStubFirebase("solid-js", "/x", undefined)).toBe(false);
  });
});

describe("accounts CSP", () => {
  it("accounts off: _headers render exactly as before", () => {
    expect(renderHeaders(template, values)).toBe(
      renderHeaders(template, { ...values, extraCsp: undefined }),
    );
    expect(directive(renderHeaders(template, values), "frame-src")).toBe(
      "frame-src 'none'",
    );
  });

  it("accounts on: adds Turnstile, Firebase Auth and the API origin", () => {
    const extraCsp = accountsCspSources({
      VITE_ACCOUNTS_API_URL: "https://api.example.test/base",
      VITE_FIREBASE_AUTH_DOMAIN: "x.firebaseapp.com",
    });
    const out = renderHeaders(template, { ...values, extraCsp });
    expect(directive(out, "frame-src")).toBe(
      "frame-src https://challenges.cloudflare.com https://x.firebaseapp.com",
    );
    expect(directive(out, "script-src")).toBe(
      "script-src 'self' 'sha256-x' https://challenges.cloudflare.com https://apis.google.com",
    );
    expect(directive(out, "connect-src")).toContain(
      "wss://ws.test https://poetrydb.org https://*.wikipedia.org https://api.example.test https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
    );
    // nothing else widened
    expect(directive(out, "default-src")).toBe("default-src 'self'");
    expect(directive(out, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(out, "object-src")).toBe("object-src 'none'");
  });

  it("throws on an unknown directive", () => {
    expect(() =>
      addCspSources("Content-Security-Policy: default-src 'self'", {
        "frame-src": ["https://x"],
      }),
    ).toThrow(/frame-src/);
  });
});
