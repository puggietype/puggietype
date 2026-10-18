import { For, JSXElement, Show } from "solid-js";

import { isBot } from "../bots";
import { BotLabel } from "./BotLabel";

const SEP = " \u00B7 ";

/**
 * A bot name ("Pug Bot · ~NN wpm") in two chunks that never break inside,
 * "Pug Bot ·" and "~NN wpm": one line where it fits, else it wraps between
 * them. Never truncated. Human names render as plain text (callers may
 * truncate them).
 */
function nameChunks(name: string): string[] {
  const i = name.indexOf(SEP);
  if (i < 0) return [name];
  return [`${name.slice(0, i)} \u00B7`, name.slice(i + SEP.length)];
}

/** a player's name in JSX: bots get the BotLabel badge before it */
export function PlayerName(props: {
  player: { name: string; isBot?: boolean };
}): JSXElement {
  return (
    <>
      <Show when={isBot(props.player)}>
        <BotLabel />
      </Show>
      <Show
        when={isBot(props.player)}
        fallback={<span>{props.player.name}</span>}
      >
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
    </>
  );
}
