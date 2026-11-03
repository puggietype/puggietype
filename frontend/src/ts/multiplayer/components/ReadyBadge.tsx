import { JSXElement } from "solid-js";

import type { PlayerState } from "../protocol";

import { Fa } from "../../components/common/Fa";
import { cn } from "../../utils/cn";

/**
 * "ready" / "waiting" pill; "in lobby" for a player sitting the race out,
 * "racing" for the others while a race runs (`racing`)
 */
export function ReadyBadge(props: {
  player: Pick<PlayerState, "ready" | "inLobby">;
  racing?: boolean;
  /** text color for the non-ready states (default text-sub); your own results row passes text-text where sub misses AA */
  idleText?: string;
}): JSXElement {
  const state = (): "ready" | "lobby" | "waiting" | "racing" => {
    if (props.racing === true && !props.player.inLobby) return "racing";
    if (props.player.ready) return "ready";
    return props.player.inLobby ? "lobby" : "waiting";
  };
  const LABEL = {
    ready: { text: "ready", icon: "fa-check" },
    lobby: { text: "in lobby", icon: "fa-door-open" },
    waiting: { text: "waiting", icon: "fa-hourglass-half" },
    racing: { text: "racing", icon: "fa-flag-checkered" },
  } as const;
  return (
    <span
      class={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-(--font) whitespace-nowrap",
        state() === "ready"
          ? "bg-opp2 text-bg"
          : cn("bg-sub-alt", props.idleText ?? "text-sub"),
      )}
      data-testid="mp-ready-badge"
      data-state={state()}
    >
      <Fa icon={LABEL[state()].icon} />
      {LABEL[state()].text}
    </span>
  );
}
