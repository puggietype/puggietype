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

/** carets on the same spot get increasing indexes so name tags can stack */
export function stackIndexes(
  carets: { id: string; wordIndex: number; charIndex: number }[],
): Record<string, number> {
  const seen = new Map<string, number>();
  const out: Record<string, number> = {};
  for (const c of carets) {
    const key = `${c.wordIndex}:${c.charIndex}`;
    const n = seen.get(key) ?? 0;
    out[c.id] = n;
    seen.set(key, n + 1);
  }
  return out;
}

/**
 * Stack level for each caret's name tag so no two tags overlap, even across
 * lines: tags are placed top line first, left to right, and each takes the
 * lowest level (each level lifts the tag by `step` px) that doesn't collide
 * with a tag already placed. A tag that would need more than `maxLevels`
 * levels gets -1 (hide it; its caret and progress row still show the colour).
 */
export function stackTagLevels(
  tags: { id: string; x: number; y: number; width: number }[],
  step = 18,
  height = 16,
  gap = 4,
  maxLevels = Number.POSITIVE_INFINITY,
): Record<string, number> {
  const out: Record<string, number> = {};
  const placed: { x: number; y: number; width: number }[] = [];
  const sorted = [...tags].sort(
    (a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1),
  );
  for (const t of sorted) {
    let level = 0;
    const hits = (y: number): boolean =>
      placed.some(
        (p) =>
          t.x < p.x + p.width + gap &&
          p.x < t.x + t.width + gap &&
          y < p.y + height &&
          p.y < y + height,
      );
    while (hits(t.y - level * step) && level < tags.length) level++;
    if (level >= maxLevels) {
      out[t.id] = -1;
      continue;
    }
    placed.push({ x: t.x, y: t.y - level * step, width: t.width });
    out[t.id] = level;
  }
  return out;
}
