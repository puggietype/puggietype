import type { FunboxName } from "@monkeytype/schemas/configs";

/**
 * Funboxes that need a third-party API the steam flavor cannot reach: the
 * desktop CSP only allows the multiplayer server (desktop/src/shell.mjs).
 * poetry -> poetrydb.org, wikipedia -> *.wikipedia.org.
 */
export const STEAM_UNAVAILABLE_FUNBOXES: readonly FunboxName[] = [
  "poetry",
  "wikipedia",
];

function isSteamBuild(): boolean {
  // inline define check so the web bundle folds this to false
  return typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam";
}

/** false only for funboxes the current flavor cannot run (web: always true) */
export function isFunboxAvailable(name: string): boolean {
  if (!isSteamBuild()) return true;
  return !(STEAM_UNAVAILABLE_FUNBOXES as readonly string[]).includes(name);
}

/** drops unavailable funboxes; returns the same array when nothing changes */
export function dropUnavailableFunboxes<T extends string>(names: T[]): T[] {
  if (!isSteamBuild()) return names;
  const kept = names.filter((n) => isFunboxAvailable(n));
  return kept.length === names.length ? names : kept;
}
