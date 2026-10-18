/**
 * Client feature flags for staged rollouts. All default OFF. Two ways on:
 *  - build time: VITE_FLAGS="characterSelect,opponentDogs" (set only on the
 *    preview Pages environment, never production)
 *  - per tab: ?flags=characterSelect,opponentDogs (kept in sessionStorage for
 *    the rest of the tab; ?flags=none clears it)
 */
export const FEATURE_FLAGS = ["characterSelect", "opponentDogs"] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

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

/**
 * The enabled flags: the build-time list plus the tab's ?flags= (which is
 * persisted to `storage`, or cleared by ?flags=none).
 */
export function resolveFlags(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  buildFlags: string | undefined,
): Set<FeatureFlag> {
  const param = new URLSearchParams(search).get("flags");
  if (param !== null) {
    const list = parseFlagList(param);
    if (list.length > 0) storage.setItem(FLAGS_SESSION_KEY, list.join(","));
    else storage.removeItem(FLAGS_SESSION_KEY);
  }
  return new Set([
    ...parseFlagList(buildFlags),
    ...parseFlagList(storage.getItem(FLAGS_SESSION_KEY)),
  ]);
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
