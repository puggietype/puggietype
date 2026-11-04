import { browserStorage, browserWindow } from "./browser";
import { PlatformAdapter } from "./types";

/** current browser behavior, unchanged */
export const webAdapter: PlatformAdapter = {
  name: "web",
  adsAllowed: true,
  storage: browserStorage,
  window: browserWindow,
  input: { hasControllerSupport: () => false },
  identity: { kind: "firebase", isAvailable: () => true },
  entitlements: { getOwned: async () => [] },
};
