// Dev-only `window.__mt` handle for poking app internals from the browser console
// or browser automation. Loaded via dynamic import behind `import.meta.env.DEV`.
import { getConfig } from "../config/store";
import { setConfig } from "../config/setters";
import { navigate } from "../controllers/route-controller";
import { getActivePage } from "../states/core";
import { showModal } from "../states/modals";
import { getCurrentQuote } from "../states/test";
import { clearAllGhosts, setGhostRaceEnabled } from "../test/ghost-caret";
import {
  buildGhostKey,
  buildSamples,
  GHOST_VERSION,
  readGhostStore,
  saveGhost,
} from "../test/ghost-race";
import { restart } from "../test/test-logic";
import { getMode2 } from "../utils/misc";
import { trackedSignals } from "./signal-tracker";

function findSignal(name: string): (typeof trackedSignals)[number] {
  const matches = trackedSignals.filter((s) => s.name === name);
  if (matches.length === 0) {
    throw new Error(`No tracked signal named "${name}"`);
  }
  if (matches.length > 1) {
    throw new Error(
      `${matches.length} signals named "${name}": ${matches.map((s) => s.source).join(", ")}`,
    );
  }
  return matches[0] as (typeof trackedSignals)[number];
}

const mt = {
  navigate,
  getActivePage,
  getConfig,
  setConfig,
  showModal,
  restart,
  /** List tracked signals, optionally filtered by substring of name or source. */
  signals: (filter = "") =>
    trackedSignals
      .filter((s) => s.name.includes(filter) || s.source.includes(filter))
      .map((s) => ({ name: s.name, source: s.source, value: s.peek() })),
  getSignal: (name: string) => findSignal(name).peek(),
  setSignal: (name: string, value: unknown) => findSignal(name).set(value),
  /** ghost race (needs ?flags=ghostRace): seed a steady ghost for the current config */
  ghostRace: {
    enable: (on = true) => setGhostRaceEnabled(on),
    clear: () => clearAllGhosts(),
    list: () => readGhostStore(localStorage),
    seed: (wpm = 60, durationMs = getConfig.time * 1000 || 30_000) => {
      const key = buildGhostKey({
        ...getConfig,
        mode2: getMode2(getConfig, getCurrentQuote()),
      });
      const cps = (wpm * 5) / 60_000;
      return saveGhost(localStorage, key, {
        v: GHOST_VERSION,
        wpm,
        acc: 100,
        recordedAt: Date.now(),
        durationMs,
        samples: buildSamples(durationMs, (t) => t * cps),
      });
    },
  },
};

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- interface merging
  interface Window {
    __mt: typeof mt;
  }
}

window.__mt = mt;
