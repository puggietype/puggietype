import { getPlatformName, type PlatformName } from "../platform";
import { CLOSE_UPGRADE_REQUIRED } from "./protocol";

/** user-facing text for a session the server (or client) ended for good */
export function terminatedMessage(
  code: number,
  platform: PlatformName = getPlatformName(),
): string {
  if (code === 4000) return "This race continued in another tab.";
  if (code === CLOSE_UPGRADE_REQUIRED) {
    return platform === "steam"
      ? "Multiplayer needs a newer version of PuggieType. Update the game in Steam, then restart it."
      : "Multiplayer needs a newer version of PuggieType. Reload the page to update.";
  }
  return "The race server is full, try again later.";
}
