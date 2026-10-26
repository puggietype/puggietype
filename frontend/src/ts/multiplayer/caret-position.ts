export type CaretTarget = {
  wordIndex: number;
  letterIndex: number;
  /** caret sits after the letter (word fully typed) instead of before it */
  afterLetter: boolean;
};

export type Point = { x: number; y: number };

/** map a reported (wordIndex, charIndex) onto our word list, clamped */
export function caretTarget(
  words: readonly string[],
  wordIndex: number,
  charIndex: number,
): CaretTarget | undefined {
  if (words.length === 0) return undefined;
  if (wordIndex >= words.length) {
    const last = words.length - 1;
    return {
      wordIndex: last,
      letterIndex: Math.max(0, (words[last] ?? "").length - 1),
      afterLetter: true,
    };
  }
  const index = Math.max(0, wordIndex);
  const length = (words[index] ?? "").length;
  const chars = Math.min(Math.max(0, charIndex), length);
  if (chars >= length && length > 0) {
    return { wordIndex: index, letterIndex: length - 1, afterLetter: true };
  }
  return { wordIndex: index, letterIndex: chars, afterLetter: false };
}

/**
 * Exponential smoothing toward the target. Snaps on line changes (vertical
 * jumps) and when within half a pixel.
 */
export function smoothToward(
  current: Point,
  target: Point,
  dtMs: number,
  tauMs: number,
): Point {
  if (Math.abs(target.y - current.y) > 1) return { ...target };
  const k = 1 - Math.exp(-dtMs / tauMs);
  const x = current.x + (target.x - current.x) * k;
  if (Math.abs(target.x - x) < 0.5) return { ...target };
  return { x, y: target.y };
}

/** inputs for the opponent-caret re-measure decision (see OpponentCarets) */
export type RemeasureState = {
  /** a scroll or resize happened since the last measure */
  dirty: boolean;
  /** opponent progress (a new race:progress list) since the last measure */
  progressChanged: boolean;
  /** our own active word changed (our line may have jumped) */
  ownWordChanged: boolean;
  msSinceLast: number;
};

/** re-measure caret targets at least this often (line wraps, font loads) */
export const CARET_MEASURE_MS = 100;

/**
 * Layout reads force a style + layout pass, so caret targets are measured
 * only when something could have moved them, or every CARET_MEASURE_MS.
 */
export function shouldRemeasure(
  state: RemeasureState,
  intervalMs = CARET_MEASURE_MS,
): boolean {
  return (
    state.dirty ||
    state.progressChanged ||
    state.ownWordChanged ||
    state.msSinceLast >= intervalMs
  );
}

/**
 * transform for a progress fill: a full-width rounded bar slid left inside a
 * clipped, rounded track, so the right end stays round at any fraction
 */
export function progressFillTransform(fraction: number): string {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  if (f === 1) return "translateX(0%)";
  return `translateX(-${((1 - f) * 100).toFixed(2)}%)`;
}
