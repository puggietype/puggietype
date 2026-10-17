import { getAdProvider } from "../ads/provider";
import { Config } from "../config/store";

// the results screen is the only ad placement
function getResultSlot(): HTMLElement | undefined {
  return document.getElementById("ad-result") ?? undefined;
}

export async function renderResult(): Promise<void> {
  if (Config.ads === "off") return;
  const slot = getResultSlot();
  if (slot === undefined) return;
  await getAdProvider().renderResult(slot);
}

export function destroyResult(): void {
  const slot = getResultSlot();
  if (slot === undefined) return;
  getAdProvider().destroyResult(slot);
}
