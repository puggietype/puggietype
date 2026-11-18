import { JSXElement, Show } from "solid-js";

import type { RoomState } from "../protocol";

import { Button } from "../../components/common/Button";
import { isBot } from "../bots";
import { toggleQuickChatMute } from "../race";
import {
  myId,
  mutedPlayers,
  quickChatAvailableNow,
  quickChatHidden,
} from "../store";

/**
 * Mute one human's quick-chat for us (this tab only). Hidden for ourselves, bots, players who left,
 * and wherever quick-chat is not shown.
 */
export function QuickChatMuteButton(props: {
  room: RoomState;
  player: { id: string; name: string; isBot?: boolean };
}): JSXElement {
  const visible = (): boolean =>
    quickChatAvailableNow() &&
    !quickChatHidden() &&
    props.player.id !== myId() &&
    !isBot(props.player) &&
    props.room.players.some((p) => p.id === props.player.id && !isBot(p));
  const muted = (): boolean => mutedPlayers().has(props.player.id);
  return (
    <Show when={visible()}>
      <span class="inline-flex shrink-0 items-center gap-1">
        <Show when={muted()}>
          <span
            class="text-sm text-sub"
            data-testid="mp-quickchat-muted-chip"
            data-player-id={props.player.id}
          >
            muted
          </span>
        </Show>
        <Button
          variant="text"
          fa={{ icon: muted() ? "fa-volume-mute" : "fa-volume-up" }}
          class="py-1 text-sm"
          ariaLabel={`mute quick-chat from ${props.player.name}`}
          ariaPressed={muted()}
          dataset={{
            "data-testid": "mp-quickchat-mute",
            "data-player-id": props.player.id,
          }}
          onClick={() => toggleQuickChatMute(props.player.id)}
        />
      </span>
    </Show>
  );
}
