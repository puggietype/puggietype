/** /login on the reset form, e.g. from the recover-email page */
export const RESET_LOGIN_PATH = "/login?reset=1";

/**
 * SignInPage, once on mount: whether /login was opened with ?reset=1. The
 * query is stripped from the address bar either way.
 */
export function takeResetQuery(
  loc: Pick<Location, "search" | "pathname" | "hash"> = location,
  hist: Pick<History, "replaceState" | "state"> = history,
): boolean {
  const params = new URLSearchParams(loc.search);
  if (!params.has("reset")) return false;
  const wanted = params.get("reset") === "1";
  params.delete("reset");
  const rest = params.toString();
  hist.replaceState(
    hist.state,
    "",
    `${loc.pathname}${rest === "" ? "" : `?${rest}`}${loc.hash}`,
  );
  return wanted;
}
