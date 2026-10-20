import type { AdSlotKind, AdSlotSpec } from "./provider";

/**
 * Ad unit ids per placement, from the build env. The defaults are
 * placeholders, not real AdSense units: set the VITE_ADS_SLOT_* vars in the
 * enabling deploy.
 */
export const AD_SLOT_IDS: Record<AdSlotKind, string> = {
  result: import.meta.env.VITE_ADS_SLOT_RESULT ?? "PLACEHOLDER_SLOT_RESULT",
  rail: import.meta.env.VITE_ADS_SLOT_RAIL ?? "PLACEHOLDER_SLOT_RAIL",
  lobby: import.meta.env.VITE_ADS_SLOT_LOBBY ?? "PLACEHOLDER_SLOT_LOBBY",
  info: import.meta.env.VITE_ADS_SLOT_INFO ?? "PLACEHOLDER_SLOT_INFO",
};

/** viewport width from which result/info units are a 728x90 leaderboard */
export const WIDE_UNIT_MIN_WIDTH = 1024;
/** viewport width from which the test page shows the 160x600 side rails */
export const RAILS_MIN_WIDTH = 1600;
/** the rails need this much height to sit below the header without clipping */
export const RAILS_MIN_HEIGHT = 800;
/** minimum distance between an ad and the typing area or any button */
export const AD_CLEARANCE_PX = 150;

/** fixed size per placement, so the reserved box never changes (no CLS) */
export function getAdSlotSpec(
  kind: AdSlotKind,
  viewportWidth: number,
): AdSlotSpec {
  const slotId = AD_SLOT_IDS[kind];
  switch (kind) {
    case "rail":
      return { kind, slotId, width: 160, height: 600 };
    case "lobby":
      return { kind, slotId, width: 320, height: 100 };
    case "result":
    case "info":
      return viewportWidth >= WIDE_UNIT_MIN_WIDTH
        ? { kind, slotId, width: 728, height: 90 }
        : { kind, slotId, width: 320, height: 100 };
  }
}
