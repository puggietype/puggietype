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
