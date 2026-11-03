import { JSXElement } from "solid-js";

import { Button } from "../../components/common/Button";
import { cn } from "../../utils/cn";
import { PRIMARY_BUTTON, READY_BUTTON } from "./ui";

/** big ready toggle: primary until ready, then green "Ready ✓" */
export function ReadyButton(props: {
  ready: boolean;
  text: string;
  disabled?: boolean;
  class?: string;
  onToggle: (ready: boolean) => void;
}): JSXElement {
  return (
    <Button
      text={props.ready ? "Ready ✓" : props.text}
      class={cn(
        props.ready ? READY_BUTTON : PRIMARY_BUTTON,
        "px-6 py-3 text-lg",
        props.class,
      )}
      disabled={props.disabled}
      dataset={{
        "data-testid": "mp-ready",
        "data-ready": String(props.ready),
      }}
      onClick={() => props.onToggle(!props.ready)}
    />
  );
}
