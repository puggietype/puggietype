import { isStandalone } from "../utils/env";
import { browserStorage, browserWindow } from "./browser";
import { PlatformAdapter } from "./types";

/** current browser behavior, unchanged */
export const webAdapter: PlatformAdapter = {
  name: "web",
  adsAllowed: true,
  storage: browserStorage,
  window: browserWindow,
  input: { hasControllerSupport: () => false },
  // sign-in needs a backend; standalone builds (no BACKEND_URL) have none
  identity: { kind: "firebase", isAvailable: () => !isStandalone() },
  entitlements: { getOwned: async () => [] },
};
