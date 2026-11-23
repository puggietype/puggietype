// Ghost race: pure logic (keys, storage with caps, recording rules, replay
// math). No app imports so it stays unit-testable; the runtime glue lives in
// ghost-caret.ts. Everything here is local-only: nothing is synced or sent.
import { z } from "zod";

export const GHOST_STORAGE_KEY = "puggie-ghost-race";
export const GHOST_TOGGLE_KEY = "puggie-ghost-race-enabled";
export const GHOST_VERSION = 1;
export const MAX_GHOST_SAMPLES = 500;
export const MAX_GHOST_ENTRIES = 20;
export const MAX_GHOST_STORE_BYTES = 64 * 1024;
/** finest sampling interval while recording (a 120s run is ~480 samples, ~7 KB) */
export const GHOST_SAMPLE_STEP_MS = 250;

export type GhostStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** [ms since test start, correctly typed chars], both non-decreasing */
export type GhostSample = [number, number];

const GhostSampleSchema = z.tuple([
  z.number().finite().nonnegative(),
  z.number().finite().nonnegative(),
]);

const GhostEntrySchema = z
  .object({
    v: z.literal(GHOST_VERSION),
    wpm: z.number().finite().nonnegative(),
    acc: z.number().finite().min(0).max(100),
    recordedAt: z.number().finite().nonnegative(),
    durationMs: z.number().finite().positive(),
    samples: z.array(GhostSampleSchema).min(1).max(MAX_GHOST_SAMPLES),
  })
  .strict()
  .refine((e) => isMonotonic(e.samples), "samples not monotonic");

export type GhostEntry = z.infer<typeof GhostEntrySchema>;
export type GhostStore = Record<string, GhostEntry>;

export type GhostKeyConfig = {
  mode: string;
  mode2: string;
  punctuation: boolean;
  numbers: boolean;
  language: string;
  difficulty: string;
  lazyMode: boolean;
};

export function buildGhostKey(c: GhostKeyConfig): string {
  return [
    c.mode,
    c.mode2,
    c.punctuation,
    c.numbers,
    c.language,
    c.difficulty,
    c.lazyMode,
  ].join("|");
}

function isMonotonic(samples: GhostSample[]): boolean {
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1] as GhostSample;
    const cur = samples[i] as GhostSample;
    if (cur[0] < prev[0] || cur[1] < prev[1]) return false;
  }
  return true;
}

/** evenly picks `max` samples, always keeping the first and the last */
export function downsampleSamples(
  samples: GhostSample[],
  max = MAX_GHOST_SAMPLES,
): GhostSample[] {
  if (samples.length <= max) return samples;
  if (max <= 1) return samples.slice(-1);
  const out: GhostSample[] = [];
  const step = (samples.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(samples[Math.round(i * step)] as GhostSample);
  }
  return out;
}

/**
 * Samples `charsAt` from 0 to durationMs, at most MAX_GHOST_SAMPLES points.
 * Chars are clamped to a running max so the ghost never walks backwards.
 */
export function buildSamples(
  durationMs: number,
  charsAt: (tMs: number) => number,
  stepMs = GHOST_SAMPLE_STEP_MS,
): GhostSample[] {
  const step = Math.max(stepMs, durationMs / (MAX_GHOST_SAMPLES - 1));
  const samples: GhostSample[] = [];
  let best = 0;
  const push = (t: number): void => {
    best = Math.max(best, Math.floor(charsAt(t)));
    samples.push([Math.round(t), best]);
  };
  for (let t = 0; t < durationMs; t += step) push(t);
  push(durationMs);
  return downsampleSamples(samples);
}

function quietly(message: string, e?: unknown): void {
  console.debug(`ghost race: ${message}`, e ?? "");
}

/** corrupted, wrong-version or invalid entries are dropped silently */
export function parseGhostStore(raw: string | null): GhostStore {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    quietly("discarding corrupted store", e);
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    quietly("discarding invalid store");
    return {};
  }
  const store: GhostStore = {};
  for (const [key, value] of Object.entries(parsed)) {
    const entry = GhostEntrySchema.safeParse(value);
    if (entry.success) {
      store[key] = entry.data;
    } else {
      quietly(`discarding invalid entry ${key}`);
    }
  }
  return store;
}

export function readGhostStore(storage: GhostStorage | undefined): GhostStore {
  if (storage === undefined) return {};
  try {
    return parseGhostStore(storage.getItem(GHOST_STORAGE_KEY));
  } catch (e) {
    quietly("storage unavailable", e);
    return {};
  }
}

export function storeBytes(store: GhostStore): number {
  // keys and values are ascii, so string length is the byte count
  return JSON.stringify(store).length;
}

function oldestKey(
  entries: Map<string, GhostEntry>,
  except: string,
): string | undefined {
  let oldest: { key: string; recordedAt: number } | undefined;
  for (const [key, { recordedAt }] of entries) {
    if (key === except) continue;
    if (oldest === undefined || recordedAt < oldest.recordedAt) {
      oldest = { key, recordedAt };
    }
  }
  return oldest?.key;
}

/**
 * The store with `entry` under `key`, caps applied (samples downsampled,
 * oldest entries evicted by count then by size). undefined if the entry
 * can't fit on its own.
 */
export function putGhost(
  store: GhostStore,
  key: string,
  entry: GhostEntry,
): GhostStore | undefined {
  const entries = new Map(Object.entries(store));
  entries.set(key, { ...entry, samples: downsampleSamples(entry.samples) });
  const evictOldest = (): boolean => {
    const oldest = oldestKey(entries, key);
    return oldest !== undefined && entries.delete(oldest);
  };
  while (entries.size > MAX_GHOST_ENTRIES && evictOldest());
  while (storeBytes(Object.fromEntries(entries)) > MAX_GHOST_STORE_BYTES) {
    if (!evictOldest()) return undefined;
  }
  return Object.fromEntries(entries);
}

/** false when the entry doesn't fit or storage refuses it (quota etc.) */
export function saveGhost(
  storage: GhostStorage | undefined,
  key: string,
  entry: GhostEntry,
): boolean {
  if (storage === undefined) return false;
  const next = putGhost(readGhostStore(storage), key, entry);
  if (next === undefined) return false;
  try {
    storage.setItem(GHOST_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch (e) {
    quietly("could not save", e);
    return false;
  }
}

export function clearGhosts(storage: GhostStorage | undefined): void {
  try {
    storage?.removeItem(GHOST_STORAGE_KEY);
  } catch (e) {
    quietly("could not clear", e);
  }
}

export function readGhostToggle(storage: GhostStorage | undefined): boolean {
  try {
    return storage?.getItem(GHOST_TOGGLE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeGhostToggle(
  storage: GhostStorage | undefined,
  on: boolean,
): void {
  try {
    if (on) storage?.setItem(GHOST_TOGGLE_KEY, "1");
    else storage?.removeItem(GHOST_TOGGLE_KEY);
  } catch (e) {
    quietly("could not save toggle", e);
  }
}

export type GhostGate = {
  flagEnabled: boolean;
  toggleEnabled: boolean;
  /** a multiplayer race (room, Quick Match, open room) is running */
  raceActive: boolean;
  mode: string;
  funboxCount: number;
};

/** whether ghosts apply at all (replay, hint and recording) */
export function isGhostApplicable(g: GhostGate): boolean {
  return (
    g.flagEnabled &&
    g.toggleEnabled &&
    !g.raceActive &&
    (g.mode === "time" || g.mode === "words") &&
    g.funboxCount === 0
  );
}

/**
 * recording: applicable, PB-eligible, result saving on (the user hasn't
 * opted out of keeping results), and no ghost or a faster run
 */
export function shouldRecordGhost(
  g: GhostGate & { pbEligible: boolean; resultSaving: boolean; wpm: number },
  existing: GhostEntry | undefined,
): boolean {
  if (!isGhostApplicable(g) || !g.pbEligible || !g.resultSaving) return false;
  if (!Number.isFinite(g.wpm) || g.wpm <= 0) return false;
  return existing === undefined || g.wpm > existing.wpm;
}

/** the hint before a test starts, undefined when ghosts don't apply */
export function ghostHintText(
  g: GhostGate,
  ghost: GhostEntry | undefined,
): string | undefined {
  if (!isGhostApplicable(g)) return undefined;
  if (ghost === undefined) {
    return "set a personal best here to create your ghost";
  }
  return `racing your ghost · ${Math.round(ghost.wpm)} wpm`;
}

/** correct chars at tMs, linear between samples, clamped to the ends */
export function interpolateChars(samples: GhostSample[], tMs: number): number {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (tMs <= first[0]) return first[1];
  if (tMs >= last[0]) return last[1];
  // last sample with t <= tMs
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((samples[mid] as GhostSample)[0] <= tMs) lo = mid;
    else hi = mid;
  }
  const [t0, c0] = samples[lo] as GhostSample;
  const [t1, c1] = samples[hi] as GhostSample;
  if (t1 === t0) return c1;
  return c0 + ((c1 - c0) * (tMs - t0)) / (t1 - t0);
}

/**
 * Maps a char count onto the word list like the pace caret: each word takes
 * its letters plus one separator, letterIndex === length means after the
 * last letter. Past the known words it stays at the end of the last one.
 */
export function charsToPosition(
  chars: number,
  wordLength: (wordIndex: number) => number | undefined,
): { wordIndex: number; letterIndex: number } {
  let remaining = Math.max(0, Math.floor(chars));
  let wordIndex = 0;
  for (;;) {
    const length = wordLength(wordIndex);
    if (length === undefined) {
      if (wordIndex === 0) return { wordIndex: 0, letterIndex: 0 };
      const prev = wordIndex - 1;
      return { wordIndex: prev, letterIndex: wordLength(prev) ?? 0 };
    }
    if (remaining <= length) return { wordIndex, letterIndex: remaining };
    remaining -= length + 1;
    wordIndex++;
  }
}
