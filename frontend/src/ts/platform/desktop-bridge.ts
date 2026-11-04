import { PlatformStorage, PlatformWindow } from "./types";

/**
 * What the desktop shell's preload exposes on `window.puggieDesktop`
 * (contextBridge). Keep in sync with desktop/src/preload.cjs.
 */
export type DesktopBridge = {
  readonly version: 1;
  fullscreen: {
    isFullscreen: () => boolean;
    toggle: () => void;
  };
  storage: PlatformStorage;
  /** Steam Graphics settings: live display mode and resolution */
  display?: {
    apply: (settings: {
      displayMode: string;
      resolution: string;
      vsync: boolean;
    }) => { restartRequired: boolean };
  };
  /** Steam M3, only when the shell runs with PUGGIE_STEAM_OPENID=1 */
  steam?: {
    /**
     * System-browser Steam OpenID. Resolves with the signed openid.* params,
     * or with why there are none. Older shells resolved null on cancel.
     */
    signIn: () => Promise<SteamBridgeSignInResult>;
    /**
     * Session token (server FEATURE_STEAM_SESSION), kept by the shell in
     * the OS secure storage (Electron safeStorage) only. `set` returns false
     * when there is no secure storage; then nothing is kept. Older shells
     * have no `session`.
     */
    session?: {
      get: () => string | null;
      set: (token: string) => boolean;
      clear: () => void;
    };
  };
};

export type SteamBridgeSignInResult =
  | { openid: Record<string, string> }
  | { error: "cancelled" | "timeout" | "busy" | "failed" }
  | null;

export function getDesktopBridge(
  target: unknown = globalThis,
): DesktopBridge | undefined {
  const bridge = (target as { puggieDesktop?: unknown }).puggieDesktop;
  if (typeof bridge !== "object" || bridge === null) return undefined;
  const b = bridge as Partial<DesktopBridge>;
  if (
    b.version !== 1 ||
    b.fullscreen === undefined ||
    b.storage === undefined
  ) {
    return undefined;
  }
  return b as DesktopBridge;
}

export function bridgeWindow(bridge: DesktopBridge): PlatformWindow {
  return {
    isFullscreen: () => bridge.fullscreen.isFullscreen(),
    toggleFullscreen: () => bridge.fullscreen.toggle(),
  };
}
