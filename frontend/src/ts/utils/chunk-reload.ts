// One-shot reload when a lazy chunk fails to load. During a Pages deploy the
// old (or not yet live) hashed chunks can come back as html or 404, so a tab
// opened before the deploy can't load the next chunk it needs. Reloading
// once picks up the new html; sessionStorage stops it looping.

export const RELOAD_KEY = "bootReloadAt";
const WINDOW_MS = 60_000;

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Failed to load module script/i;

export function isChunkLoadError(reason: unknown): boolean {
  const msg =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "";
  return CHUNK_ERROR.test(msg);
}

// true = a reload already happened in the last minute (or storage is blocked)
export function reloadedRecently(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (now - last < WINDOW_MS) return true;
    sessionStorage.setItem(RELOAD_KEY, String(now));
    return false;
  } catch {
    // storage blocked: never auto-reload, so this can't loop
    return true;
  }
}

// returns true if it reloaded
export function reloadOnce(
  reload: () => void = () => location.reload(),
): boolean {
  if (reloadedRecently()) return false;
  reload();
  return true;
}

export function installChunkReload(
  target: Window = window,
  reload?: () => void,
): void {
  target.addEventListener("vite:preloadError", (event) => {
    // stops vite rethrowing; we reload instead (or let it surface if guarded)
    if (reloadOnce(reload)) event.preventDefault();
  });
  target.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      reloadOnce(reload);
    }
  });
}
