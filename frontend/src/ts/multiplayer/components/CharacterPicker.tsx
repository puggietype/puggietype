import { createSignal, For, JSXElement, onCleanup, Show } from "solid-js";

import {
  CHARACTERS,
  characterLabel,
  characterName,
  type Character,
} from "../../components/pages/test/character-frames";
import { cn } from "../../utils/cn";
import { gridMove } from "../helpers";
import { setCharacter } from "../race";
import { CharacterImage } from "./CharacterImage";

/** ≤390px the grid is 2 wide (max-[391px] below) */
const NARROW_QUERY = "(max-width: 390px)";

/** "your dog" card: 8 dogs in a 4×2 radio grid (2×4 on narrow phones) */
export function CharacterPicker(props: {
  selected: Character;
  locked: boolean;
}): JSXElement {
  const radios: HTMLButtonElement[] = [];
  const narrow = matchMedia(NARROW_QUERY);
  const [cols, setCols] = createSignal(narrow.matches ? 2 : 4);
  const onResize = (): void => {
    setCols(narrow.matches ? 2 : 4);
  };
  narrow.addEventListener("change", onResize);
  onCleanup(() => narrow.removeEventListener("change", onResize));

  const pick = (c: Character): void => {
    if (!props.locked && c !== props.selected) setCharacter(c);
  };

  const onKeyDown = (e: KeyboardEvent, index: number): void => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      pick(CHARACTERS[index] ?? props.selected);
      return;
    }
    const next = gridMove(index, e.key, cols(), CHARACTERS.length);
    if (next === undefined) return;
    e.preventDefault();
    radios[next]?.focus();
    pick(CHARACTERS[next] ?? props.selected);
  };

  return (
    <section
      class="grid content-start gap-4 rounded-lg bg-sub-alt p-6 max-sm:p-4"
      data-testid="mp-character-card"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div class="text-sm tracking-wide text-sub" id="mp-character-label">
          your dog
        </div>
        <div class="text-sm text-sub" aria-live="polite">
          <Show
            when={props.locked}
            fallback={
              <>
                racing as{" "}
                <span class="text-main">{characterName(props.selected)}</span>
              </>
            }
          >
            un-ready to change dog
          </Show>
        </div>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="mp-character-label"
        aria-disabled={props.locked ? "true" : undefined}
        class="grid w-fit grid-cols-4 gap-2 justify-self-center max-[391px]:grid-cols-2"
        data-testid="mp-character-picker"
        title={props.locked ? "un-ready to change dog" : undefined}
      >
        <For each={CHARACTERS}>
          {(c, i) => (
            <button
              ref={(el) => (radios[i()] = el)}
              type="button"
              role="radio"
              aria-checked={c === props.selected}
              aria-label={characterLabel(c)}
              title={characterLabel(c)}
              aria-disabled={props.locked ? "true" : undefined}
              tabIndex={c === props.selected ? 0 : -1}
              class={cn(
                "group grid size-22 place-items-center rounded-lg border-2 bg-bg p-1 transition-colors max-[481px]:size-16",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main",
                c === props.selected
                  ? "border-main"
                  : "border-transparent hover:border-sub",
                props.locked && c !== props.selected && "opacity-40",
                props.locked && "cursor-not-allowed hover:border-transparent",
              )}
              data-testid={`mp-character-${c}`}
              data-selected={String(c === props.selected)}
              onClick={() => pick(c)}
              onKeyDown={(e) => onKeyDown(e, i())}
            >
              <CharacterImage character={c} frame="idle" class="size-full" />
            </button>
          )}
        </For>
      </div>
    </section>
  );
}
