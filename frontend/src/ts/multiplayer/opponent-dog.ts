/**
 * Opponent dog animation, from race:progress only (no opponent keystrokes):
 * a tick where their position moved means "typing", and typing alternates the
 * left/right paw at a rate mapped from their wpm. Pure, so it's unit-tested.
 */

export type OpponentPaw = "idle" | "left" | "right";
export type OpponentFrame = OpponentPaw | "winnerSmall";

type Position = { wordIndex: number; charIndex: number };

/** characters to (approximately) gain per paw press */
const CHARS_PER_WORD = 5;
export const MIN_PAW_FPS = 2;
export const MAX_PAW_FPS = 8;
/** keep typing this long after the last advancing tick (server ticks at 10 Hz) */
export const TYPING_HOLD_MS = 300;

/** did the opponent move forward since the last tick? */
export function advanced(prev: Position | undefined, next: Position): boolean {
  if (prev === undefined) return next.wordIndex > 0 || next.charIndex > 0;
  if (next.wordIndex !== prev.wordIndex) return next.wordIndex > prev.wordIndex;
  return next.charIndex > prev.charIndex;
}

/** ms between paw swaps: one per typed char, clamped to 2..8 fps */
export function pawIntervalMs(wpm: number): number {
  const charsPerSecond = (Math.max(0, wpm) * CHARS_PER_WORD) / 60;
  const fps = Math.min(MAX_PAW_FPS, Math.max(MIN_PAW_FPS, charsPerSecond));
  return 1000 / fps;
}

export function nextPaw(prev: OpponentPaw): OpponentPaw {
  return prev === "left" ? "right" : "left";
}

export function opponentFrame(state: {
  finished: boolean;
  connected: boolean;
  typing: boolean;
  paw: OpponentPaw;
  reducedMotion: boolean;
}): OpponentFrame {
  if (state.finished) return "winnerSmall";
  if (!state.connected || !state.typing || state.reducedMotion) return "idle";
  return state.paw;
}

/**
 * The frame shown after each progress tick, given the per-tick position
 * deltas (one paw swap per advancing tick; a still tick goes idle). Reduced
 * motion: always idle.
 */
export function pawSequence(
  deltas: readonly number[],
  reducedMotion: boolean,
): OpponentPaw[] {
  let paw: OpponentPaw = "idle";
  return deltas.map((delta) => {
    paw = reducedMotion || delta <= 0 ? "idle" : nextPaw(paw);
    return paw;
  });
}

/** head bob duration (s) like the own pug: none below 130 wpm */
export function shakeDuration(wpm: number): number {
  const min = 130;
  const max = 180;
  if (wpm <= min) return 0;
  const t = Math.min(1, (wpm - min) / (max - min));
  return 0.25 + (0.01 - 0.25) * t;
}

/**
 * shakeDuration in 0.05 s steps (min 0.05 s): the raw value changed on every
 * progress tick at 130+ wpm, and each new animation-duration restarts the
 * shake animation
 */
export function steppedShakeDuration(wpm: number): number {
  const d = shakeDuration(wpm);
  return d === 0 ? 0 : Math.max(0.05, Math.round(d * 20) / 20);
}

/** smoothing time constant (ms of the opponent's race time) for the shake wpm */
export const SHAKE_WPM_TAU_MS = 500;
/** the smoothed wpm must clear the current step by this much to switch */
export const SHAKE_HYSTERESIS_WPM = 4;

export type ShakeState = { wpm: number; testMs: number; duration: number };

/**
 * Per-opponent shake step from race:progress. Their wpm is correct chars over
 * race time, so a hesitation or correction dips it for a tick or two (most
 * early on) and the raw step flickered (0.05 -> 0.1 -> 0.15 s for a steady
 * 250 wpm bot). EMA over their testMs (immune to arrival jitter), then only
 * switch steps once the smoothed wpm is clearly out of the current one.
 */
export function nextShake(
  prev: ShakeState | undefined,
  wpm: number,
  testMs: number,
): ShakeState {
  if (prev === undefined || testMs < prev.testMs) {
    return { wpm, testMs, duration: steppedShakeDuration(wpm) };
  }
  const k = 1 - Math.exp(-(testMs - prev.testMs) / SHAKE_WPM_TAU_MS);
  const smooth = prev.wpm + (wpm - prev.wpm) * k;
  const outside =
    steppedShakeDuration(smooth - SHAKE_HYSTERESIS_WPM) !== prev.duration &&
    steppedShakeDuration(smooth + SHAKE_HYSTERESIS_WPM) !== prev.duration;
  return {
    wpm: smooth,
    testMs,
    duration: outside ? steppedShakeDuration(smooth) : prev.duration,
  };
}
