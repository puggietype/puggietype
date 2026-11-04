import { For, JSXElement } from "solid-js";

import type { SteamSettings } from "./settings-store";

import { Button } from "../components/common/Button";
import { updateSteamSettings } from "./game-settings";

type Option<T> = { value: T; text: string };

export function Choice<T>(props: {
  id: string;
  options: readonly Option<T>[];
  selected: T;
  onSelect: (value: T) => void;
}): JSXElement {
  return (
    <div
      data-testid={props.id}
      class="grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2"
    >
      <For each={props.options}>
        {(o) => (
          <Button
            active={props.selected === o.value}
            ariaPressed={props.selected === o.value}
            onClick={() => props.onSelect(o.value)}
            text={o.text}
          />
        )}
      </For>
    </div>
  );
}

export const ON_OFF = [
  { value: false, text: "off" },
  { value: true, text: "on" },
] as const;

export const set = (change: (s: SteamSettings) => SteamSettings): void =>
  updateSteamSettings(change);
