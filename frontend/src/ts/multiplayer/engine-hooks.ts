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

/** while set, the words generator returns these words in order */
export function setRaceWords(words: readonly string[] | undefined): void {
  raceWords = words;
}

export function isRaceActive(): boolean {
  return raceWords !== undefined;
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
 * Called by test-logic finish(). Returns true when the race took the result,
 * in which case the engine must not save it or show the result screen.
 */
export function handleRaceFinish(data: RaceFinishData): boolean {
  if (raceWords === undefined || finishHandler === undefined) return false;
  finishHandler(data);
  return true;
}
