// /account/action: the email action link (password reset, verify email,
// recover email) Firebase sends, with our page set as its action URL. Only
// `mode` and `oobCode` are read; `continueUrl`, `apiKey` and `lang` are
// ignored, so the link can't send anyone elsewhere.

export type ActionLink = { mode: string; oobCode: string };

// in memory only: never stored, logged or put back in the URL
let pending: ActionLink | undefined;

/**
 * route-controller, before the page renders (or analytics sees the URL):
 * keeps mode and oobCode in memory and strips the query and hash from the
 * address bar. A visit without a query keeps what an earlier one captured.
 */
export function captureActionLink(
  loc: Pick<Location, "search" | "hash" | "pathname"> = location,
  hist: Pick<History, "replaceState" | "state"> = history,
): void {
  if (loc.search === "" && loc.hash === "") return;
  const params = new URLSearchParams(loc.search);
  pending = {
    mode: params.get("mode") ?? "",
    oobCode: params.get("oobCode") ?? "",
  };
  hist.replaceState(hist.state, "", loc.pathname);
}

/** the page, once: the captured link (then forgotten) */
export function takeActionLink(): ActionLink | undefined {
  const link = pending;
  pending = undefined;
  return link;
}
