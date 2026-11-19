import { getPlatform } from "../platform";
import { installMasterGain } from "./master-gain";

/**
 * First import of index.tsx: on the steam build, wrap AudioContext with the
 * master gain (at the stored master × SFX volume) before any other module
 * can create one. On web the inline check folds to false and this module
 * is empty. Reads the three fields by hand (no schema module here: building
 * it is a side effect the web bundle would keep).
 */
const unit = (v: unknown): number =>
  typeof v === "number" && v >= 0 && v <= 1 ? v : 1;

export function storedSfxGain(raw: string | null): number {
  try {
    const s = JSON.parse(raw ?? "{}") as Record<string, unknown> | null;
    if (s === null || typeof s !== "object") return 1;
    return s["muted"] === true
      ? 0
      : unit(s["masterVolume"]) * unit(s["sfxVolume"]);
  } catch {
    return 1;
  }
}

if (typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam") {
  installMasterGain(
    window,
    storedSfxGain(getPlatform().storage.getItem("steamGameSettings")),
  );
}
