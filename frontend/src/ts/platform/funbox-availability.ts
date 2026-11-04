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

/**
 * Call sites also compare the define inline, so on web these are never
 * referenced and the module is tree-shaken out of the bundle.
 */
/** false only for funboxes the current flavor cannot run (web: always true) */
export function isFunboxAvailable(name: string): boolean {
  if (!(typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam")) {
    return true;
  }
  return !(STEAM_UNAVAILABLE_FUNBOXES as readonly string[]).includes(name);
}

/** drops unavailable funboxes; returns the same array when nothing changes */
export function dropUnavailableFunboxes<T extends string>(names: T[]): T[] {
  if (!(typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam")) {
    return names;
  }
  const kept = names.filter((n) => isFunboxAvailable(n));
  return kept.length === names.length ? names : kept;
}
