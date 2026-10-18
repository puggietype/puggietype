import { createSignal, JSXElement, onCleanup, Show } from "solid-js";

import type { RoomState } from "../protocol";

import { Button } from "../../components/common/Button";
import { isBot } from "../bots";
import { kickPlayer } from "../race";
import { isHost, myId } from "../store";

const CONFIRM_MS = 3000;

/** host only, lobby or results, never bots: two clicks (kick? -> kick) remove a player */
export function KickButton(props: {
  room: RoomState;
  playerId: string;
  name: string;
}): JSXElement {
  const [armed, setArmed] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  const visible = (): boolean =>
    isHost() &&
    props.playerId !== myId() &&
    (props.room.phase === "lobby" || props.room.phase === "results") &&
    props.room.players.some((p) => p.id === props.playerId && !isBot(p));

  const click = (): void => {
    if (armed()) {
      clearTimeout(timer);
      setArmed(false);
      kickPlayer(props.playerId);
      return;
    }
    setArmed(true);
    timer = setTimeout(() => setArmed(false), CONFIRM_MS);
  };

  return (
    <Show when={visible()}>
      <Button
        variant="text"
        text={armed() ? "kick?" : undefined}
        fa={{ icon: "fa-user-times" }}
        class="py-1 text-sm"
        balloon={{
          text: armed() ? `confirm kick ${props.name}` : `kick ${props.name}`,
          position: "left",
        }}
        dataset={{
          "data-testid": "mp-kick",
          "data-player-id": props.playerId,
          "data-armed": String(armed()),
        }}
        onClick={click}
      />
    </Show>
  );
}
