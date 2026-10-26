import {
  createMemo,
  For,
  JSXElement,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";

import { getActiveWordIndex } from "../../states/test";
import { cn } from "../../utils/cn";
import { caretTarget, type Point } from "../caret-position";
import {
  myId,
  opponentProgress,
  race,
  room,
  showOpponentCarets,
} from "../store";
import { PLAYER_BG } from "./ui";

/** glide between measured positions (one progress tick is 100 ms) */
const GLIDE_MS = 120;
/** re-measure caret targets at least this often (line wraps, font loads) */
const MEASURE_MS = 100;

type Measured = { x: number; y: number; height: number; visible: boolean };

/** viewport position of the caret for (wordIndex, charIndex) on #words */
function measure(
  words: readonly string[],
  wordIndex: number,
  charIndex: number,
  wrapper: DOMRect | undefined,
): Measured | undefined {
  const target = caretTarget(words, wordIndex, charIndex);
  if (target === undefined) return undefined;
  const wordEl = document.querySelector(
    `#words .word[data-wordindex='${target.wordIndex}']`,
  );
  const letters = wordEl?.querySelectorAll("letter");
  const letter = letters?.[target.letterIndex] ?? letters?.[letters.length - 1];
  if (letter === undefined) return undefined;
  const rect = letter.getBoundingClientRect();
  const visible =
    wrapper !== undefined &&
    rect.height > 0 &&
    rect.top >= wrapper.top - 2 &&
    rect.bottom <= wrapper.bottom + 2;
  return {
    x: target.afterLetter ? rect.right : rect.left,
    y: rect.top,
    height: rect.height,
    visible,
  };
}

function hide(el: HTMLElement): void {
  if (el.dataset["visible"] === "false") return;
  el.dataset["visible"] = "false";
  el.classList.add("opacity-0");
}

/**
 * Opponent carets drawn over the words, in each player's colour only: no name
 * tag. Each colour matches the swatch on that player's progress-bar row, which
 * carries the name and bot label. Positions are re-measured when anyone moves,
 * on scroll/resize and at least every 100 ms, so line jumps and resizes just
 * work; movement along a line is a short compositor transition.
 */
export function OpponentCarets(): JSXElement {
  // ids only, so carets survive room:state updates (which replace players)
  const opponentIds = createMemo(
    () =>
      (room()?.players ?? []).filter((p) => p.id !== myId()).map((p) => p.id),
    [],
    { equals: (a, b) => a.join() === b.join() },
  );
  const player = (id: string) => room()?.players.find((p) => p.id === id);
  const elements = new Map<string, HTMLDivElement>();
  const positions = new Map<string, Point>();
  let frame = 0;

  // layout reads are the expensive part (each one forces a style + layout
  // pass on top of the engine's own), so targets are measured only when an
  // opponent moved, our own word changed (line jumps), the page scrolled or
  // resized, or at MEASURE_MS at the latest. Frames in between only smooth
  // toward the cached targets and write transforms.
  const targets = new Map<string, Measured | undefined>();
  let measuredFor: unknown;
  let measuredWord = -1;
  let measuredAt = -Infinity;
  let dirty = true;
  const markDirty = (): void => {
    dirty = true;
  };

  const remeasure = (
    words: readonly string[],
    opponents: readonly {
      id: string;
      wordIndex: number;
      charIndex: number;
      finished: boolean;
    }[],
  ): void => {
    const wrapper = document
      .querySelector("#wordsWrapper")
      ?.getBoundingClientRect();
    for (const id of elements.keys()) {
      const p = opponents.find((pp) => pp.id === id);
      targets.set(
        id,
        p !== undefined && !p.finished
          ? measure(words, p.wordIndex, p.charIndex, wrapper)
          : undefined,
      );
    }
  };

  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick);
    const info = race();
    if (info === undefined || !showOpponentCarets()) return;
    const progress = opponentProgress();
    const ownWord = getActiveWordIndex();
    if (
      dirty ||
      progress !== measuredFor ||
      ownWord !== measuredWord ||
      now - measuredAt >= MEASURE_MS
    ) {
      remeasure(
        info.words,
        progress.filter((p) => p.id !== myId()),
      );
      measuredFor = progress;
      measuredWord = ownWord;
      measuredAt = now;
      dirty = false;
      place(progress);
    }
  };

  /**
   * Write each caret's new target once per measurement. Movement along a line
   * is a short CSS transform transition, so the browser animates it off the
   * main thread; line jumps and first shows snap.
   */
  const place = (progress: readonly { id: string; wordIndex: number }[]) => {
    for (const [id, el] of elements) {
      const m = targets.get(id);
      if (m === undefined || !m.visible) {
        hide(el);
        positions.delete(id);
        continue;
      }
      const prev = positions.get(id);
      const snap = prev === undefined || Math.abs(prev.y - m.y) > 1;
      positions.set(id, { x: m.x, y: m.y });
      const transition = snap ? "none" : `transform ${GLIDE_MS}ms linear`;
      if (el.style.transition !== transition) el.style.transition = transition;
      const p = progress.find((pp) => pp.id === id);
      if (p !== undefined && el.dataset["wordIndex"] !== String(p.wordIndex)) {
        el.dataset["wordIndex"] = String(p.wordIndex);
      }
      // only touch the DOM when something changed
      if (el.dataset["visible"] !== "true") {
        el.dataset["visible"] = "true";
        el.classList.remove("opacity-0");
      }
      const transform = `translate(${(m.x - 1).toFixed(1)}px, ${m.y.toFixed(1)}px)`;
      if (el.style.transform !== transform) el.style.transform = transform;
      const h = `${m.height}px`;
      if (el.style.height !== h) el.style.height = h;
    }
  };

  onMount(() => {
    frame = requestAnimationFrame(tick);
    window.addEventListener("resize", markDirty, { passive: true });
    window.addEventListener("scroll", markDirty, {
      passive: true,
      capture: true,
    });
  });
  onCleanup(() => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", markDirty);
    window.removeEventListener("scroll", markDirty, { capture: true });
  });

  return (
    <Portal>
      <Show when={showOpponentCarets()}>
        <For each={opponentIds()}>
          {(id) => (
            <div
              ref={(el) => {
                elements.set(id, el);
                onCleanup(() => {
                  if (elements.get(id) === el) elements.delete(id);
                });
              }}
              class="pointer-events-none fixed top-0 left-0 z-50 w-0.5 opacity-0 will-change-transform"
              data-testid="mp-opponent-caret"
              data-player-id={id}
              data-color={player(id)?.color ?? "opp1"}
              data-visible="false"
              aria-hidden="true"
            >
              {/* colour only: the name and bot label live on the progress row */}
              <div
                class={cn(
                  "h-full w-full rounded-full",
                  PLAYER_BG[player(id)?.color ?? "opp1"],
                  player(id)?.connected === false && "opacity-50",
                )}
                data-testid="mp-opponent-caret-bar"
              ></div>
            </div>
          )}
        </For>
      </Show>
    </Portal>
  );
}
