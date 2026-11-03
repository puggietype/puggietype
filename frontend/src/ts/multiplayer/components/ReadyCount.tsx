import { JSXElement } from "solid-js";

import { cn } from "../../utils/cn";

/** "N/M ready" next to the host's start button */
export function ReadyCount(props: {
  ready: number;
  total: number;
}): JSXElement {
  return (
    <span
      class={cn(
        "text-sm font-(--font) whitespace-nowrap",
        props.total > 0 && props.ready === props.total
          ? "text-opp2"
          : "text-sub",
      )}
      data-testid="mp-ready-count"
      aria-live="polite"
      aria-atomic="true"
    >
      {props.ready}/{props.total} ready
    </span>
  );
}
