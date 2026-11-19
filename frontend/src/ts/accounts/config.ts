export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
};

export type AccountsConfig = {
  /** PuggieType API base url, e.g. https://api.puggietype.com */
  apiUrl: string;
  /** Cloudflare Turnstile site key; empty = widget unavailable */
  turnstileSiteKey: string;
  firebase: FirebaseWebConfig;
};

type Env = Record<string, string | boolean | undefined>;

function str(env: Env, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

/** reads the accounts build env (all public values, none are secrets) */
export function parseAccountsConfig(env: Env): AccountsConfig {
  return {
    apiUrl: str(env, "VITE_ACCOUNTS_API_URL").replace(/\/+$/, ""),
    turnstileSiteKey: str(env, "VITE_TURNSTILE_SITE_KEY"),
    firebase: {
      apiKey: str(env, "VITE_FIREBASE_API_KEY"),
      authDomain: str(env, "VITE_FIREBASE_AUTH_DOMAIN"),
      projectId: str(env, "VITE_FIREBASE_PROJECT_ID"),
      appId: str(env, "VITE_FIREBASE_APP_ID"),
    },
  };
}

/** @returns what is missing for sign-in to work, empty when usable */
export function missingAccountsConfig(config: AccountsConfig): string[] {
  const missing: string[] = [];
  if (config.apiUrl === "") missing.push("VITE_ACCOUNTS_API_URL");
  const fb = config.firebase;
  if (fb.apiKey === "") missing.push("VITE_FIREBASE_API_KEY");
  if (fb.authDomain === "") missing.push("VITE_FIREBASE_AUTH_DOMAIN");
  if (fb.projectId === "") missing.push("VITE_FIREBASE_PROJECT_ID");
  if (fb.appId === "") missing.push("VITE_FIREBASE_APP_ID");
  return missing;
}

export function getAccountsConfig(): AccountsConfig {
  return parseAccountsConfig(import.meta.env);
}
