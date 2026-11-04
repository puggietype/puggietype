/**
 * Platform adapter: the seam between the shared core and a build flavor.
 * The web flavor keeps current browser behavior. The steam flavor is a
 * plain desktop shell (no Steamworks SDK of any kind); identity is Steam
 * OpenID and entitlements are checked server-side (CheckAppOwnership).
 */
export type PlatformName = "web" | "steam";

export const PLATFORM_NAMES: readonly PlatformName[] = ["web", "steam"];

export type PlatformStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type PlatformWindow = {
  isFullscreen: () => boolean;
  toggleFullscreen: () => void;
};

export type PlatformInput = {
  /** true when a gamepad / Steam Deck style controller layer is active */
  hasControllerSupport: () => boolean;
};

export type PlatformIdentityKind = "firebase" | "steam-openid";

export type PlatformIdentity = {
  readonly kind: PlatformIdentityKind;
  /** true when this flavor can start a sign-in flow today */
  isAvailable: () => boolean;
};

export type PlatformEntitlements = {
  /** ids of owned paid content (DLC art packs); web has none */
  getOwned: () => Promise<readonly string[]>;
};

export type PlatformAdapter = {
  readonly name: PlatformName;
  /** steam flavor must never show ads */
  readonly adsAllowed: boolean;
  storage: PlatformStorage;
  window: PlatformWindow;
  input: PlatformInput;
  identity: PlatformIdentity;
  entitlements: PlatformEntitlements;
};
