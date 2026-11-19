// Steam game settings that the main process applies: display mode,
// resolution and VSync. Pure helpers (no Electron import) so they can be
// unit tested. Field names and values must match
// frontend/src/ts/steam/settings-store.ts (STEAM_SETTINGS_KEY).
export const STEAM_SETTINGS_KEY = "steamGameSettings";
export const DISPLAY_MODES = ["windowed", "borderless", "fullscreen"];
export const RESOLUTIONS = [
  "native",
  "1280x720",
  "1366x768",
  "1600x900",
  "1920x1080",
  "2560x1440",
];
export const DEFAULT_DISPLAY = Object.freeze({
  displayMode: "windowed",
  resolution: "native",
  vsync: true,
});

/** Display fields from the renderer's store value; bad values -> defaults. */
export function parseDisplay(value) {
  let v = value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const o = v && typeof v === "object" && !Array.isArray(v) ? v : {};
  return {
    displayMode: DISPLAY_MODES.includes(o.displayMode)
      ? o.displayMode
      : DEFAULT_DISPLAY.displayMode,
    resolution: RESOLUTIONS.includes(o.resolution)
      ? o.resolution
      : DEFAULT_DISPLAY.resolution,
    vsync: typeof o.vsync === "boolean" ? o.vsync : DEFAULT_DISPLAY.vsync,
  };
}

/** Chromium switches for VSync off; read once at startup (needs a restart). */
export function vsyncSwitches(display) {
  return display.vsync ? [] : ["disable-gpu-vsync", "disable-frame-rate-limit"];
}

/**
 * The window state for a display setting. screen = the display's work area
 * size ({ width, height }). Windowed "native" fills the work area; a fixed
 * size is clamped to it. Borderless is a frameless window covering the
 * whole screen bounds; fullscreen is the OS fullscreen.
 */
export function windowState(display, screen) {
  const mode = display.displayMode;
  if (mode === "fullscreen") return { fullscreen: true, frameless: false };
  if (mode === "borderless") {
    return {
      fullscreen: false,
      frameless: true,
      bounds: {
        x: screen.x ?? 0,
        y: screen.y ?? 0,
        width: screen.width,
        height: screen.height,
      },
    };
  }
  let width = screen.width;
  let height = screen.height;
  if (display.resolution !== "native") {
    const [w, h] = display.resolution.split("x").map(Number);
    width = Math.min(w, screen.width);
    height = Math.min(h, screen.height);
  }
  return { fullscreen: false, frameless: false, size: { width, height } };
}

/** BrowserWindow constructor options for the display at startup. */
export function windowOptionsFor(display) {
  return display.displayMode === "borderless" ? { frame: false } : {};
}

/**
 * True when going from one display to another needs a restart: a window's
 * frame can't be added or removed while it is open (borderless), and
 * VSync is a Chromium switch read at launch.
 */
export function needsRestart(started, next) {
  return (
    started.vsync !== next.vsync ||
    (started.displayMode === "borderless") !==
      (next.displayMode === "borderless")
  );
}

/** Apply windowState to a BrowserWindow-like object (live). */
export function applyWindowState(win, state) {
  if (state.fullscreen) {
    win.setFullScreen(true);
    return;
  }
  if (win.isFullScreen()) win.setFullScreen(false);
  if (state.frameless) {
    win.setMenuBarVisibility?.(false);
    win.setBounds(state.bounds);
    return;
  }
  win.setSize(state.size.width, state.size.height);
  win.center?.();
}
