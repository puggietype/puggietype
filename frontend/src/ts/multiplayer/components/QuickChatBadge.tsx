import { JSXElement, Show } from "solid-js";

import { quickChatItem, type QuickChatEntry } from "../quick-chat";
import {
  quickChatAvailableNow,
  quickChatHidden,
  quickChatLatest,
} from "../store";
import { QuickChatFace } from "./QuickChatFace";

/** a player's latest quick-chat next to their name (decorative: the live region announces it) */
export function QuickChatBadge(props: { playerId: string }): JSXElement {
  const entry = (): QuickChatEntry | undefined =>
    quickChatAvailableNow() && !quickChatHidden()
      ? quickChatLatest().get(props.playerId)
      : undefined;
  return (
    <Show when={entry()}>
      {(e) => (
        <span
          aria-hidden="true"
          class="inline-flex max-w-40 min-w-0 shrink items-center gap-1 truncate rounded bg-bg px-2 py-0.5 text-sm text-main"
          data-testid="mp-quickchat-badge"
          data-player-id={props.playerId}
          data-preset-id={e().presetId}
        >
          <QuickChatFace item={quickChatItem(e().presetId)} />
        </span>
      )}
    </Show>
  );
}
