import { For, JSXElement, Show } from "solid-js";

import { isBot, showBotBadge } from "../bots";
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

/** a player's name in JSX: every isBot player gets the BotLabel badge before it */
export function PlayerName(props: {
  player: { name: string; isBot?: boolean };
  /** humans only: one line with ellipsis (block, needs a width-bound parent) */
  truncate?: boolean;
}): JSXElement {
  return (
    <>
      {/* every flagged bot carries the label (Legal); the pattern only picks the layout */}
      <Show when={isBot(props.player)}>
        <BotLabel />
      </Show>
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
        {/* full name as one accessible name (role=img like BotLabel), so the
            chunks aren't read piecemeal and the "Bot" badge isn't repeated */}
        <span
          role="img"
          title={props.player.name}
          aria-label={props.player.name}
          data-testid="mp-player-name"
        >
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
