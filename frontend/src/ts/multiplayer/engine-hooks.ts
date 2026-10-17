/**
 * Minimal state the typing engine consults during a multiplayer race.
 * Kept dependency free so engine modules can import it without cycles.
 * Engine call sites are marked `// multiplayer hook`.
 */

export type RaceFinishData = {
  wpm: number;
  raw: number;
  acc: number;
  testMs: number;
  /** engine input history per word, up to the last typed word */
  input: string[];
  keyCount: number;
};

let raceWords: readonly string[] | undefined;
let inputLocked = false;
let restartLocked = false;
let finishHandler: ((data: RaceFinishData) => void) | undefined;
/** a pending discard expires, so it can't eat a later solo result */
const DISCARD_WINDOW_MS = 10_000;
let discardUntil = 0;

/** while set, the words generator returns these words in order */
export function setRaceWords(words: readonly string[] | undefined): void {
  raceWords = words;
}

export function isRaceActive(): boolean {
  return raceWords !== undefined;
}

/** length of the race word list, undefined outside a race */
export function getRaceWordCount(): number | undefined {
  return raceWords?.length;
}

/** the server word for this index, undefined outside a race or past the list */
export function getRaceWord(wordIndex: number): string | undefined {
  return raceWords?.[wordIndex];
}

/** blocks typing during the countdown */
export function setRaceInputLocked(locked: boolean): void {
  inputLocked = locked;
}

export function isRaceInputLocked(): boolean {
  return inputLocked;
}

/** blocks user restarts (tab, esc, config changes) while racing */
export function setRaceRestartLocked(locked: boolean): void {
  restartLocked = locked;
}

export function isRaceRestartLocked(): boolean {
  return restartLocked;
}

export function onRaceFinish(
  handler: ((data: RaceFinishData) => void) | undefined,
): void {
  finishHandler = handler;
}

/**
 * The race ended while the engine was already computing a result: swallow
 * that result once instead of letting it become a solo test.
 */
export function discardPendingRaceFinish(): void {
  discardUntil = Date.now() + DISCARD_WINDOW_MS;
}

/**
 * Called by test-logic finish(). Returns true when the race took the result,
 * in which case the engine must not save it or show the result screen.
 */
export function handleRaceFinish(data: RaceFinishData): boolean {
  if (Date.now() < discardUntil) {
    discardUntil = 0;
    return true;
  }
  if (raceWords === undefined || finishHandler === undefined) return false;
  finishHandler(data);
  return true;
}
