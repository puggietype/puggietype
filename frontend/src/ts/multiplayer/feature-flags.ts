/**
 * Client feature flags for staged rollouts. All default ON except
 * DEFAULT_OFF_FLAGS, which only an explicit list turns on. Overrides:
 *  - build time: VITE_FLAGS="opponentDogs" (only those) or "none" (all off)
 *  - per tab: ?flags=characterSelect (only those) or ?flags=none (kill
 *    switch); kept in sessionStorage for the rest of the tab. Any other
 *    ?flags= value (e.g. ?flags=default) clears the override.
 */
export const FEATURE_FLAGS = [
  "characterSelect",
  "opponentDogs",
  "openRooms",
  "quickMatch",
  "report",
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** off unless named in VITE_FLAGS or ?flags= (openRooms shipped Oct 18, 2026; still needs the server flag) */
export const DEFAULT_OFF_FLAGS: readonly FeatureFlag[] = [
  "quickMatch",
  "report",
];

export const FLAGS_SESSION_KEY = "puggie-flags";

export function parseFlagList(value: string | null | undefined): FeatureFlag[] {
  if (value === null || value === undefined) return [];
  return value
    .split(",")
    .map((f) => f.trim())
    .filter((f): f is FeatureFlag =>
      (FEATURE_FLAGS as readonly string[]).includes(f),
    );
}

const NONE = "none";

/** "none" -> [], a flag list -> those flags, unset/unknown -> undefined */
function parseOverride(
  value: string | null | undefined,
): FeatureFlag[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (value.trim() === NONE) return [];
  const list = parseFlagList(value);
  return list.length > 0 ? list : undefined;
}

/**
 * The enabled flags: the tab's ?flags= override (persisted to `storage`),
 * else the build-time list, else all but DEFAULT_OFF_FLAGS.
 */
export function resolveFlags(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  buildFlags: string | undefined,
): Set<FeatureFlag> {
  const param = new URLSearchParams(search).get("flags");
  if (param !== null) {
    const list = parseOverride(param);
    if (list === undefined) {
      storage.removeItem(FLAGS_SESSION_KEY);
    } else {
      storage.setItem(
        FLAGS_SESSION_KEY,
        list.length > 0 ? list.join(",") : NONE,
      );
    }
  }
  return new Set(
    parseOverride(storage.getItem(FLAGS_SESSION_KEY)) ??
      parseOverride(buildFlags) ??
      FEATURE_FLAGS.filter((f) => !DEFAULT_OFF_FLAGS.includes(f)),
  );
}

// read once at startup, before client-side navigation drops the query string
const enabled = resolveFlags(
  window.location.search,
  sessionStorage,
  import.meta.env["VITE_FLAGS"] as string | undefined,
);

export function isFlagEnabled(flag: FeatureFlag): boolean {
  return enabled.has(flag);
}
