// Steam Deck baseline (smoke only): the window at the Deck's 1280x800, no
// horizontal overflow, and the Gamepad API usable (not blocked by a
// permissions policy or the CSP). Pure helpers (no Electron import) so they
// can be unit tested; main.mjs runs them with PUGGIE_SMOKE_DECK=<dir>.
export const DECK_SIZE = Object.freeze({ width: 1280, height: 800 });

/**
 * How the smoke gets a 1280x800 viewport: on a Deck-sized display, true
 * fullscreen (as in Steam game mode; a 1280x800 window can't fit there);
 * on a bigger display, a window with a 1280x800 content area.
 */
export function deckMode(displaySize) {
  return displaySize?.width === DECK_SIZE.width &&
    displaySize?.height === DECK_SIZE.height
    ? "fullscreen"
    : "window";
}

/** Renderer probe (run with executeJavaScript); returns a plain object. */
export const DECK_PROBE = `(() => {
  const de = document.documentElement;
  let gamepads = "missing";
  if (typeof navigator.getGamepads === "function") {
    try {
      gamepads = Array.isArray(Array.from(navigator.getGamepads())) ? "ok" : "bad";
    } catch (e) {
      gamepads = "threw " + String(e && e.name);
    }
  }
  const policy = document.permissionsPolicy ?? document.featurePolicy;
  return {
    path: location.pathname,
    viewport: [window.innerWidth, window.innerHeight],
    scrollWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
    bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
    gamepads,
    gamepadPolicy: policy && typeof policy.allowsFeature === "function"
      ? policy.allowsFeature("gamepad")
      : null,
  };
})()`;

/** Why a probe result fails the baseline ([] = pass). */
export function deckProbeProblems(r) {
  const p = [];
  if (
    r?.viewport?.[0] !== DECK_SIZE.width ||
    r?.viewport?.[1] !== DECK_SIZE.height
  )
    p.push(`viewport ${r?.viewport?.join("x")} is not 1280x800`);
  if (
    !(r?.scrollWidth <= r?.clientWidth) ||
    !(r?.bodyScrollWidth <= r?.clientWidth)
  )
    p.push(`horizontal overflow on ${r?.path}`);
  if (r?.gamepads !== "ok") p.push(`navigator.getGamepads: ${r?.gamepads}`);
  if (r?.gamepadPolicy === false)
    p.push("gamepad blocked by permissions policy");
  return p;
}

/** D-pad walk result (main.mjs padWalk): focus moved each press, onto visible controls. */
export function padWalkProblems(w) {
  if (!w || !Array.isArray(w.steps)) return ["no pad walk result"];
  const p = [];
  if (w.stuck !== 0) p.push(`focus stuck ${w.stuck}x`);
  if (w.hidden !== 0) p.push(`focus on hidden control ${w.hidden}x`);
  return p;
}
