import type { Config, ConfigKey, PaceCaret } from "@monkeytype/schemas/configs";

import { isStandalone } from "../utils/env";
import { getDefaultConfig } from "./default-config";

/** routes that need an account or the backend; 404 in standalone builds */
const BACKEND_ROUTES: readonly string[] = [
  "/verify",
  "/leaderboards",
  "/login",
  "/account",
  "/account-settings",
  "/profile",
  "/profile/:uidOrName",
  "/friends",
];

/** settings that only do something with an account (saved results, pbs) */
const ACCOUNT_ONLY_CONFIG_KEYS: readonly ConfigKey[] = [
  "resultSaving",
  "showAverage",
  "showPb",
];

/** pace caret modes that read the account's results */
const ACCOUNT_ONLY_PACE_CARETS: readonly PaceCaret[] = [
  "pb",
  "tagPb",
  "average",
  "daily",
];

/** commandline commands that need an account or the backend */
const BACKEND_COMMAND_IDS: readonly string[] = [
  "viewLeaderboards",
  "viewAccount",
  "searchProfile",
  "signOut",
];

export function isRouteHidden(path: string): boolean {
  return isStandalone() && BACKEND_ROUTES.includes(path);
}

export function isConfigKeyHidden(key: ConfigKey): boolean {
  return isStandalone() && ACCOUNT_ONLY_CONFIG_KEYS.includes(key);
}

export function isPaceCaretHidden(mode: PaceCaret): boolean {
  return isStandalone() && ACCOUNT_ONLY_PACE_CARETS.includes(mode);
}

export function isCommandHidden(id: string): boolean {
  return isStandalone() && BACKEND_COMMAND_IDS.includes(id);
}

/**
 * Resets account-only values a stored or imported config may carry (e.g.
 * from Monkeytype): their settings are hidden, so users couldn't undo them.
 */
export function resetAccountOnlyConfig(config: Config): Config {
  if (!isStandalone()) return config;
  const defaults = getDefaultConfig();
  const reset = { ...config };
  for (const key of ACCOUNT_ONLY_CONFIG_KEYS) {
    (reset as Record<ConfigKey, unknown>)[key] = defaults[key];
  }
  if (isPaceCaretHidden(reset.paceCaret)) reset.paceCaret = "off";
  return reset;
}
