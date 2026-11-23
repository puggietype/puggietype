// Ghost race runtime: replays the local PB run as #ghostCaret and records new
// PB runs. Behind the ghostRace flag (default off) and a local toggle; with
// either off nothing is shown and nothing is written. Pure logic: ghost-race.ts.
import { createSignal } from "solid-js";

import { Config } from "../config/store";
import { Caret } from "../elements/caret";
import { isRaceActive } from "../multiplayer/engine-hooks";
import { isFlagEnabled } from "../multiplayer/feature-flags";
import {
  CompletedResult,
  getCurrentQuote,
  isDirectionReversed,
  isLanguageRightToLeft,
} from "../states/test";
import { ElementWithUtils } from "../utils/dom";
import { getMode2, prefersReducedMotion } from "../utils/misc";
import { getChars } from "./events/stats";
import { EventLog } from "./events/types";
import {
  buildGhostKey,
  buildSamples,
  charsToPosition,
  clearGhosts,
  GHOST_VERSION,
  GhostEntry,
  GhostGate,
  ghostHintText,
  GhostStorage,
  interpolateChars,
  isGhostApplicable,
  readGhostStore,
  readGhostToggle,
  saveGhost,
  shouldRecordGhost,
  writeGhostToggle,
} from "./ghost-race";
import { getPbEligibility } from "./result-pb";
import * as TestWords from "./test-words";

const TICK_MS = 100;

let ghost: GhostEntry | undefined;
let startMs = 0;
let interval: ReturnType<typeof setInterval> | undefined;
let lastPos = "";

function storage(): GhostStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const [isToggleOn, setToggleOn] = createSignal(readGhostToggle(storage()));
const [getHint, setHint] = createSignal<string | undefined>(undefined);

/** settings toggle (local only, never synced) */
export function isGhostRaceEnabled(): boolean {
  return isToggleOn();
}

export function setGhostRaceEnabled(on: boolean): void {
  if (!isFlagEnabled("ghostRace")) return;
  writeGhostToggle(storage(), on);
  setToggleOn(on);
}

export function clearAllGhosts(): void {
  if (!isFlagEnabled("ghostRace")) return;
  clearGhosts(storage());
  ghost = undefined;
}

/** text for #ghostRaceHint, undefined when it shouldn't show */
export function getGhostHint(): string | undefined {
  return getHint();
}

function currentGate(): GhostGate {
  return {
    flagEnabled: isFlagEnabled("ghostRace"),
    toggleEnabled: isToggleOn(),
    raceActive: isRaceActive(),
    mode: Config.mode,
    funboxCount: Config.funbox.length,
  };
}

function currentKey(): string {
  return buildGhostKey({
    ...Config,
    mode2: getMode2(Config, getCurrentQuote()),
  });
}

// #ghostCaret is rendered by TestPage only while the flag is on
export let caret: Caret | undefined;

export function initElement(
  refs: {
    caret: ElementWithUtils;
    words: ElementWithUtils;
    wordsWrapper: ElementWithUtils;
  },
  signal: AbortSignal,
): void {
  const created = new Caret(refs.caret, "default", refs);
  caret = created;
  signal.addEventListener("abort", () => {
    if (caret === created) caret = undefined;
  });
}

/** restart: load the ghost for this exact config and set the hint */
export function init(): void {
  reset();
  const gate = currentGate();
  if (!isGhostApplicable(gate)) {
    ghost = undefined;
    setHint(undefined);
    return;
  }
  ghost = readGhostStore(storage())[currentKey()];
  setHint(ghostHintText(gate, ghost));
}

/** words rendered: park the hidden caret on the first letter */
export function resetCaretPosition(): void {
  if (caret === undefined) return;
  caret.hide();
  caret.stopAllAnimations();
  caret.clearMargins();
  lastPos = "";
  if (ghost === undefined) return;
  goTo(0, false);
}

function goTo(chars: number, animate: boolean): void {
  const pos = charsToPosition(
    chars,
    (i) => TestWords.words.get(i)?.text.length,
  );
  const id = `${pos.wordIndex}:${pos.letterIndex}`;
  if (id === lastPos) return;
  lastPos = id;
  caret?.goTo({
    ...pos,
    isLanguageRightToLeft: isLanguageRightToLeft(),
    isDirectionReversed: isDirectionReversed(),
    animate,
    animationOptions: { duration: TICK_MS, easing: "linear" },
  });
}

function tick(): void {
  const current = ghost;
  if (current === undefined) return;
  const elapsed = performance.now() - startMs;
  goTo(interpolateChars(current.samples, elapsed), !prefersReducedMotion());
  // time mode ends at durationMs, words mode at the end of its run
  if (elapsed >= current.durationMs) stopTicking();
}

function stopTicking(): void {
  if (interval !== undefined) clearInterval(interval);
  interval = undefined;
}

/** test start (first keystroke) */
export function start(now: number): void {
  stopTicking();
  if (ghost === undefined || caret === undefined) return;
  if (!isGhostApplicable(currentGate())) return;
  startMs = now;
  caret.show();
  tick();
  interval = setInterval(tick, TICK_MS);
}

/** test end, restart or leaving the page */
export function reset(): void {
  stopTicking();
  startMs = 0;
  caret?.hide();
}

/** finish(), for a valid (not necessarily saved) solo result */
export function recordResult(
  result: CompletedResult,
  eventLog: EventLog,
): void {
  try {
    const gate = { ...currentGate(), mode: result.mode };
    if (!isGhostApplicable(gate)) return;
    const store = storage();
    const key = buildGhostKey(result);
    const existing = readGhostStore(store)[key];
    const pbEligible = getPbEligibility(result, false)?.value === true;
    const record = shouldRecordGhost(
      {
        ...gate,
        funboxCount: result.funbox.length,
        pbEligible,
        resultSaving: Config.resultSaving,
        wpm: result.wpm,
      },
      existing,
    );
    if (!record) return;
    const durationMs = Math.round(result.testDuration * 1000);
    if (durationMs <= 0) return;
    // off the result path: sampling replays the event log a few hundred times
    setTimeout(() => {
      try {
        saveGhost(store, key, {
          v: GHOST_VERSION,
          wpm: result.wpm,
          acc: result.acc,
          recordedAt: Date.now(),
          durationMs,
          samples: buildSamples(
            durationMs,
            (t) => getChars(eventLog, true, t).correctWord,
          ),
        });
      } catch (e) {
        console.debug("ghost race: recording failed", e);
      }
    }, 0);
  } catch (e) {
    console.debug("ghost race: recording failed", e);
  }
}
