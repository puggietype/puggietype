import { For, JSXElement, Show } from "solid-js";

import { showBotBadge } from "../bots";
import { BotLabel } from "./BotLabel";

const SEP = " · ";

/**
 * A bot name ("Pug Bot · ~NN wpm") in two chunks that never break inside,
 * "Pug Bot ·" and "~NN wpm": one line where it fits, else it wraps between
 * them. Never truncated. Human names (and bots with malformed names) render
 * as plain text with a full-name title; `truncate` clips them to one line.
 */
function nameChunks(name: string): string[] {
  const i = name.indexOf(SEP);
  if (i < 0) return [name];
  return [`${name.slice(0, i)} ·`, name.slice(i + SEP.length)];
}

/** a player's name in JSX: bots get the BotLabel badge before it */
export function PlayerName(props: {
  player: { name: string; isBot?: boolean };
  /** humans only: one line with ellipsis (block, needs a width-bound parent) */
  truncate?: boolean;
}): JSXElement {
  return (
    <Show
      when={showBotBadge(props.player)}
      fallback={
        <span
          class={props.truncate ? "block w-full min-w-0 truncate" : undefined}
          title={props.player.name}
        >
          {props.player.name}
        </span>
      }
    >
      <BotLabel />
      <span>
        <For each={nameChunks(props.player.name)}>
          {(chunk, i) => (
            <>
              {i() > 0 ? " " : ""}
              <span class="whitespace-nowrap">{chunk}</span>
            </>
          )}
        </For>
      </span>
    </Show>
  );
}
