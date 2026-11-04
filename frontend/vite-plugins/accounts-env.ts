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
