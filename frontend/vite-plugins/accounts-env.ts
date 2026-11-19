import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Plugin } from "vite";

/** VITE_FEATURE_ACCOUNTS: same literal check as src/ts/accounts/flag.ts */
export function isAccountsEnabled(env: Record<string, string>): boolean {
  return env["VITE_FEATURE_ACCOUNTS"] === "true";
}

/** prod builds with accounts on must say where sign-in goes */
export function checkAccountsEnv(env: Record<string, string>): void {
  const required = [
    "VITE_ACCOUNTS_API_URL",
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_APP_ID",
  ];
  const missing = required.filter((key) => (env[key] ?? "").trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `VITE_FEATURE_ACCOUNTS=true needs ${missing.join(", ")} (Turnstile key optional)`,
    );
  }
  const api = new URL(env["VITE_ACCOUNTS_API_URL"] ?? "");
  if (api.protocol !== "https:") {
    throw new Error("VITE_ACCOUNTS_API_URL must be https in production");
  }
}

/** extra CSP sources for sign-in: Turnstile, Firebase Auth, the API */
export function accountsCspSources(
  env: Record<string, string>,
): Record<string, string[]> {
  const apiOrigin = new URL(env["VITE_ACCOUNTS_API_URL"] ?? "").origin;
  const authDomain = `https://${(env["VITE_FIREBASE_AUTH_DOMAIN"] ?? "").trim()}`;
  return {
    "script-src": [
      "https://challenges.cloudflare.com",
      "https://apis.google.com",
    ],
    "frame-src": ["https://challenges.cloudflare.com", authDomain],
    "connect-src": [
      apiOrigin,
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
    ],
  };
}

/**
 * Flag off: Tailwind must not scan the accounts UI (src/ts/accounts), or its
 * classes land in the CSS of a build that never renders them.
 */
export function accountsTailwindSources(options: {
  enabled: boolean;
  cssFile: string;
}): Plugin {
  return {
    name: "accounts-tailwind-sources",
    enforce: "pre",
    transform(code, id) {
      if (options.enabled || id.split("?")[0] !== options.cssFile) return;
      return { code: excludeAccountsSources(code), map: null };
    },
  };
}

/** appends the Tailwind exclusion, relative to src/styles/tailwind.css */
export function excludeAccountsSources(css: string): string {
  return `${css}\n@source not "../ts/accounts";\n`;
}

/** router paths that exist only with accounts on (static/_redirects lacks them) */
export const ACCOUNTS_ONLY_PATHS: readonly string[] = ["/account/action"];

/**
 * Cloudflare Pages has no SPA fallback here (dist has a 404.html), so every
 * router path needs a rewrite. Accounts-only paths get theirs in the build
 * output only with the flag on; an off build keeps _redirects byte for byte.
 * The trailing-slash 301s go before the first rewrite (first match wins).
 */
export function addAccountsRedirects(redirects: string): string {
  const lines = redirects.split("\n");
  const firstRewrite = lines.findIndex(
    (l) => !l.startsWith("#") && l.trim().endsWith(" 200"),
  );
  const at = firstRewrite === -1 ? lines.length : firstRewrite;
  const slash = ACCOUNTS_ONLY_PATHS.map((p) => `${p}/ ${p} 301`);
  const rewrites = ACCOUNTS_ONLY_PATHS.map((p) => `${p} / 200`);
  const out = [...lines.slice(0, at), ...slash, ...lines.slice(at)];
  // keep a final newline last
  const end = out.at(-1) === "" ? out.length - 1 : out.length;
  out.splice(end, 0, ...rewrites);
  return out.join("\n");
}

export function accountsRedirects(options: { enabled: boolean }): Plugin {
  let outDir = path.resolve("./dist");
  return {
    name: "accounts-redirects",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!options.enabled) return;
      const file = path.join(outDir, "_redirects");
      if (!existsSync(file)) return;
      writeFileSync(file, addAccountsRedirects(readFileSync(file, "utf8")));
    },
  };
}
