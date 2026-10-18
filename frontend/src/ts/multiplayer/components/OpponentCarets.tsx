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
import { displayName } from "../bots";
import {
  caretTarget,
  smoothToward,
  stackTagLevels,
  type Point,
} from "../caret-position";
import {
  myId,
  opponentProgress,
  race,
  room,
  showOpponentCarets,
} from "../store";
import { PLAYER_BG } from "./ui";

const SMOOTH_TAU_MS = 70;
/** name tags of carets on the same spot stack upward by this many px */
const TAG_STACK_PX = 18;
/** tags that would stack higher than this are hidden */
const MAX_TAG_LEVELS = 2;

type Measured = { x: number; y: number; height: number; visible: boolean };

/** viewport position of the caret for (wordIndex, charIndex) on #words */
function measure(
  words: readonly string[],
  wordIndex: number,
  charIndex: number,
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
  const wrapper = document
    .querySelector("#wordsWrapper")
    ?.getBoundingClientRect();
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
 * Opponent carets drawn over the words, in each player's colour with a name
 * tag. Positions are re-measured every frame, so line jumps and resizes just
 * work; movement along a line is smoothed.
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
    const placed: { id: string; x: number; y: number; width: number }[] = [];
    for (const [id, el] of elements) {
      const p = opponents.find((pp) => pp.id === id);
      const m =
        p !== undefined && !p.finished
          ? measure(info.words, p.wordIndex, p.charIndex)
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
      el.dataset["visible"] = "true";
      el.dataset["wordIndex"] = String(p.wordIndex);
      el.classList.remove("opacity-0");
      el.style.transform = `translate(${next.x - 1}px, ${next.y}px)`;
      el.style.height = `${m.height}px`;
      const tag = el.querySelector<HTMLElement>(
        "[data-testid='mp-opponent-tag']",
      );
      placed.push({ id, x: next.x, y: next.y, width: tag?.offsetWidth ?? 0 });
    }
    // name tags that would overlap on the same line stack upward
    // at most 2 rows of tags so they don't cover the line above
    const levels = stackTagLevels(placed, TAG_STACK_PX, 16, 4, MAX_TAG_LEVELS);
    for (const { id } of placed) {
      const el = elements.get(id);
      const level = levels[id] ?? 0;
      el?.style.setProperty(
        "--tag-offset",
        `${-Math.max(0, level) * TAG_STACK_PX}px`,
      );
      if (el) el.dataset["tag"] = level < 0 ? "hidden" : "shown";
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
              class="group pointer-events-none fixed top-0 left-0 z-50 w-0.5 rounded-full opacity-0 transition-opacity"
              data-testid="mp-opponent-caret"
              data-player-id={id}
              data-visible="false"
            >
              <div
                class={cn(
                  "h-full w-full rounded-full",
                  PLAYER_BG[player(id)?.color ?? "opp1"],
                )}
              >
                <span
                  class={cn(
                    "absolute bottom-full left-0 mb-0.5 translate-y-(--tag-offset) rounded px-1.5 py-px text-[0.7rem] leading-tight font-(--ui-font) font-semibold whitespace-nowrap text-bg group-data-[tag=hidden]:invisible",
                    PLAYER_BG[player(id)?.color ?? "opp1"],
                    player(id)?.connected === false && "opacity-50",
                  )}
                  data-testid="mp-opponent-tag"
                >
                  <Show when={player(id)}>{(p) => displayName(p())}</Show>
                </span>
              </div>
            </div>
          )}
        </For>
      </Show>
    </Portal>
  );
}
