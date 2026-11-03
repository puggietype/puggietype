import { JSXElement, Show } from "solid-js";

import type { PlayerState } from "../protocol";

import { Fa } from "../../components/common/Fa";
import { cn } from "../../utils/cn";

/** "ready" / "waiting" pill; `in lobby` for a player sitting the race out */
export function ReadyBadge(props: {
  player: Pick<PlayerState, "ready" | "inLobby">;
}): JSXElement {
  const state = (): "ready" | "lobby" | "waiting" => {
    if (props.player.ready) return "ready";
    return props.player.inLobby ? "lobby" : "waiting";
  };
  return (
    <span
      class={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-(--font) whitespace-nowrap",
        state() === "ready" ? "bg-opp2 text-bg" : "bg-sub-alt text-sub",
      )}
      data-testid="mp-ready-badge"
      data-state={state()}
    >
      <Show
        when={state() === "ready"}
        fallback={
          <Fa
            icon={state() === "lobby" ? "fa-door-open" : "fa-hourglass-half"}
          />
        }
      >
        <Fa icon="fa-check" />
      </Show>
      {state() === "ready"
        ? "ready"
        : state() === "lobby"
          ? "in lobby"
          : "waiting"}
    </span>
  );
}
