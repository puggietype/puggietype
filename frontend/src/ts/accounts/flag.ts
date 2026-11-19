// Accounts milestone A (sign-in) is gated by the build-time define
// `__FEATURE_ACCOUNTS__` (VITE_FEATURE_ACCOUNTS=true, see vite.config.ts).
// Gate sites use the define itself, not a re-exported const: rolldown only
// drops a gated import() when the literal is right there.

/** localStorage key set while signed in, so boot only loads Firebase then */
export const SESSION_HINT_KEY = "ptAccountsSession";

export function hasSessionHint(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(SESSION_HINT_KEY) === "1";
}
