import { createSignal } from "solid-js";

/** local choice for "Show my score on the leaderboard". On unless set to false. */
const KEY = "puggie-lb-show";

function readStored(storage: Pick<Storage, "getItem">): boolean {
  try {
    return storage.getItem(KEY) !== "false";
  } catch {
    return true;
  }
}

const [showOnLeaderboard, setShowOnLeaderboardSignal] = createSignal(
  readStored(localStorage),
);

export { showOnLeaderboard };

export function setShowOnLeaderboard(
  show: boolean,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(KEY, show ? "true" : "false");
  } catch {
    // storage blocked: the in-memory choice still applies this page load
  }
  setShowOnLeaderboardSignal(show);
}

/** test helper */
/** current saved choice, without subscribing */
export function readShowOnLeaderboard(
  storage: Pick<Storage, "getItem"> = localStorage,
): boolean {
  return readStored(storage);
}

export function loadShowOnLeaderboard(
  storage: Pick<Storage, "getItem">,
): boolean {
  const show = readStored(storage);
  setShowOnLeaderboardSignal(show);
  return show;
}
