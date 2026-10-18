import { JSXElement, Show } from "solid-js";

import { isBot } from "../bots";
import { BotLabel } from "./BotLabel";

/** a player's name in JSX: bots get the BotLabel badge before it */
export function PlayerName(props: {
  player: { name: string; isBot?: boolean };
}): JSXElement {
  return (
    <>
      <Show when={isBot(props.player)}>
        <BotLabel />
      </Show>
      {/* a bot name is one unit ("Pug Bot · ~NN wpm"): wrap before it, never inside */}
      <span class="whitespace-nowrap">{props.player.name}</span>
    </>
  );
}
