import { envConfig } from "virtual:env-config";

export function isDevEnvironment(): boolean {
  return envConfig.isDevelopment;
}

/** true when running without a backend (no auth, api, leaderboards) */
export function isStandalone(): boolean {
  return envConfig.standalone;
}
