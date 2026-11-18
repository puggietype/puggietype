import { JSXElement, Show } from "solid-js";

import { Fa } from "../../components/common/Fa";
import { type QuickChatItem } from "../quick-chat";

/** the item for an entry, as text and (for emotes) an icon: ids only, never wire text */
export function QuickChatFace(props: { item: QuickChatItem }): JSXElement {
  return (
    <>
      <Show when={props.item.icon}>
        {(icon) => (
          <span aria-hidden="true" class="shrink-0">
            <Fa icon={icon()} fixedWidth />
          </span>
        )}
      </Show>
      <span>{props.item.text}</span>
    </>
  );
}
