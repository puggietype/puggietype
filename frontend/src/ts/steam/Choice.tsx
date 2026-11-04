import { For, JSXElement } from "solid-js";

import type { SteamSettings } from "./settings-store";

import { Button } from "../components/common/Button";
import { updateSteamSettings } from "./game-settings";
import "./steam-settings.css";

type Option<T> = { value: T; text: string };

export function Choice<T>(props: {
  id: string;
  options: readonly Option<T>[];
  selected: T;
  onSelect: (value: T) => void;
  /** wider columns for long labels (e.g. 2560×1440) */
  wide?: boolean;
}): JSXElement {
  return (
    <div
      data-testid={props.id}
      data-steam-choice={props.wide === true ? "wide" : ""}
      class="grid gap-2"
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
