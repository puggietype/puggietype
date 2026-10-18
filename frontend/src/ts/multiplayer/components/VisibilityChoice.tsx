import { For, JSXElement } from "solid-js";

import { cn } from "../../utils/cn";

const LABEL = "text-sm tracking-wide text-sub";

export type Visibility = "private" | "open";

const VISIBILITY_CHOICES: {
  value: Visibility;
  label: string;
  hint: string;
  description: string;
}[] = [
  {
    value: "private",
    label: "Private",
    hint: "only people with the code can join",
    description: "Private: only people with the code can join",
  },
  {
    value: "open",
    label: "Open",
    hint: "anyone can see this room's code and join",
    description: "Open: anyone can see this room's code and join",
  },
];

/** private or open, for the room about to be created */
export function VisibilityChoice(props: {
  value: Visibility;
  onChange: (value: Visibility) => void;
}): JSXElement {
  return (
    <fieldset class="grid gap-3" data-testid="mp-create-visibility">
      <legend class={cn(LABEL, "mb-2")}>who can join</legend>
      <For each={VISIBILITY_CHOICES}>
        {(choice) => (
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <label class="flex cursor-pointer items-center gap-2 text-text">
              <input
                type="radio"
                name="mpCreateVisibility"
                value={choice.value}
                class="size-4 cursor-pointer accent-main"
                checked={props.value === choice.value}
                aria-describedby={`mpCreateHint-${choice.value}`}
                data-testid={`mp-create-${choice.value}`}
                onChange={() => props.onChange(choice.value)}
              />
              {choice.label}
            </label>
            <span
              class="text-sm leading-relaxed text-text opacity-80"
              aria-hidden="true"
              data-testid={`mp-create-hint-${choice.value}`}
            >
              {choice.hint}
            </span>
            <span id={`mpCreateHint-${choice.value}`} class="sr-only">
              {choice.description}
            </span>
          </div>
        )}
      </For>
    </fieldset>
  );
}
