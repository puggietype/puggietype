import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCOUNTS_ONLY_PATHS,
  accountsCspSources,
  accountsRedirects,
  addAccountsRedirects,
  accountsTailwindSources,
  excludeAccountsSources,
} from "../../vite-plugins/accounts-env";
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

describe("accounts Tailwind sources", () => {
  const cssFile = "/repo/frontend/src/styles/tailwind.css";
  const run = (enabled: boolean, id: string): unknown => {
    const plugin = accountsTailwindSources({ enabled, cssFile });
    const transform = plugin.transform as (code: string, id: string) => unknown;
    return transform.call({}, '@import "tailwindcss";', id);
  };

  it("accounts off: excludes src/ts/accounts from tailwind.css", () => {
    expect(run(false, cssFile)).toEqual({
      code: excludeAccountsSources('@import "tailwindcss";'),
      map: null,
    });
    expect(run(false, `${cssFile}?direct`)).toBeDefined();
    expect(excludeAccountsSources("")).toContain(
      '@source not "../ts/accounts";',
    );
  });

  it("accounts on, or any other file: untouched", () => {
    expect(run(true, cssFile)).toBeUndefined();
    expect(run(false, "/repo/frontend/src/styles/other.css")).toBeUndefined();
  });

  it("the excluded path is the accounts dir next to styles/", () => {
    const dir = path.resolve(path.dirname(cssFile), "../ts/accounts");
    expect(dir).toBe("/repo/frontend/src/ts/accounts");
  });
});

describe("accounts redirects (Cloudflare Pages)", () => {
  const redirects = readFileSync(
    path.resolve(__dirname, "../../static/_redirects"),
    "utf8",
  );

  it("static/_redirects has no accounts-only path (off builds unchanged)", () => {
    for (const p of ACCOUNTS_ONLY_PATHS) expect(redirects).not.toContain(p);
  });

  it("accounts on: rewrites /account/action to the app, slash 301 first", () => {
    const out = addAccountsRedirects(redirects);
    const lines = out.split("\n");
    const slash = lines.indexOf("/account/action/ /account/action 301");
    const rewrite = lines.indexOf("/account/action / 200");
    const firstRewrite = lines.findIndex(
      (l) => !l.startsWith("#") && l.endsWith(" 200"),
    );
    expect(slash).toBeGreaterThanOrEqual(0);
    expect(slash).toBeLessThan(firstRewrite);
    expect(rewrite).toBeGreaterThan(firstRewrite);
    // everything else kept, in order
    expect(lines.filter((l) => !l.includes("/account/action"))).toEqual(
      redirects.split("\n"),
    );
    expect(out.endsWith("\n")).toBe(redirects.endsWith("\n"));
  });

  type Hooks = {
    configResolved: (c: unknown) => void;
    closeBundle: () => void;
  };
  const build = (enabled: boolean): string => {
    const dir = mkdtempSync(path.join(tmpdir(), "acc-redirects-"));
    writeFileSync(path.join(dir, "_redirects"), redirects);
    const plugin = accountsRedirects({ enabled }) as unknown as Hooks;
    plugin.configResolved({ root: dir, build: { outDir: "." } });
    plugin.closeBundle();
    return readFileSync(path.join(dir, "_redirects"), "utf8");
  };

  it("the plugin only touches dist/_redirects with the flag on", () => {
    expect(build(false)).toBe(redirects);
    expect(build(true)).toBe(addAccountsRedirects(redirects));
  });
});

describe("accounts gate sites (source)", () => {
  const src = (file: string): string =>
    readFileSync(path.resolve(__dirname, "../../src/ts", file), "utf8");

  it.each([
    ["accounts/session.ts", 'import("./settings-sync")'],
    ["test/test-logic.ts", 'import("../accounts/personal-bests")'],
    [
      "components/pages/page-registry.ts",
      'import("../../accounts/ui/AccountActionPage")',
    ],
  ])("%s: %s sits behind an inline __FEATURE_ACCOUNTS__", (file, site) => {
    const code = src(file);
    const at = code.indexOf(site);
    expect(at).toBeGreaterThan(0);
    // the define is the literal right before the import (rolldown only
    // drops a gated import() with the literal at the site)
    const before = code.slice(Math.max(0, at - 300), at);
    expect(before).toContain("__FEATURE_ACCOUNTS__");
  });

  it("route-controller: /account/action only inside the gate", () => {
    const code = src("controllers/route-controller.ts");
    const gate = code.indexOf("...(__FEATURE_ACCOUNTS__");
    const route = code.indexOf('path: "/account/action"');
    expect(gate).toBeGreaterThan(0);
    expect(route).toBeGreaterThan(gate);
    expect(route - gate).toBeLessThan(200);
  });

  it("config/persistence: the sync listener only fires behind the define", () => {
    const code = src("config/persistence.ts");
    const calls = [...code.matchAll(/notifyAccountsConfigSaved\(\);/g)];
    expect(calls).toHaveLength(2);
    for (const m of calls) {
      expect(code.slice((m.index ?? 0) - 30, m.index)).toContain(
        "if (__FEATURE_ACCOUNTS__)",
      );
    }
  });
});
