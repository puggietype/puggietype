import {
  createMemo,
  For,
  JSXElement,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";

import { cn } from "../../utils/cn";
import { caretTarget, smoothToward, type Point } from "../caret-position";
import {
  myId,
  opponentProgress,
  race,
  room,
  showOpponentCarets,
} from "../store";
import { PLAYER_BG } from "./ui";

const SMOOTH_TAU_MS = 70;

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

/**
 * Opponent carets drawn over the words, in each player's colour only: no name
 * tag. Each colour matches the swatch on that player's progress-bar row, which
 * carries the name and bot label. Positions are re-measured every frame, so
 * line jumps and resizes just work; movement along a line is smoothed.
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
  let last = performance.now();

  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick);
    const dt = now - last;
    last = now;
    const info = race();
    if (info === undefined || !showOpponentCarets()) return;
    const opponents = opponentProgress().filter((p) => p.id !== myId());
    const wrapper = document
      .querySelector("#wordsWrapper")
      ?.getBoundingClientRect();
    // read everything first, then write, so a frame costs one layout
    const placed: {
      el: HTMLDivElement;
      x: number;
      y: number;
      height: number;
    }[] = [];
    for (const [id, el] of elements) {
      const p = opponents.find((pp) => pp.id === id);
      const m =
        p !== undefined && !p.finished
          ? measure(info.words, p.wordIndex, p.charIndex, wrapper)
          : undefined;
      if (p === undefined || m === undefined || !m.visible) {
        el.dataset["visible"] = "false";
        el.classList.add("opacity-0");
        positions.delete(id);
        continue;
      }
      const prev = positions.get(id) ?? { x: m.x, y: m.y };
      const next = smoothToward(prev, { x: m.x, y: m.y }, dt, SMOOTH_TAU_MS);
      positions.set(id, next);
      el.dataset["wordIndex"] = String(p.wordIndex);
      placed.push({ el, x: next.x - 1, y: next.y, height: m.height });
    }
    for (const { el, x, y, height } of placed) {
      el.dataset["visible"] = "true";
      el.classList.remove("opacity-0");
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.height = `${height}px`;
    }
  };

  onMount(() => {
    frame = requestAnimationFrame(tick);
  });
  onCleanup(() => cancelAnimationFrame(frame));

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
              class="pointer-events-none fixed top-0 left-0 z-50 w-0.5 opacity-0 transition-opacity"
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
