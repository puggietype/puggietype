import { For, JSXElement, Show } from "solid-js";

import type { OpenRoomEntry } from "../protocol";

import { Button } from "../../components/common/Button";
import { Fa } from "../../components/common/Fa";
import {
  botsText,
  humansText,
  openRoomsStatus,
  roomAgeAria,
  roomAgeText,
  type RoomsList,
} from "../open-rooms";
import { PRIMARY_BUTTON, settingsSummary } from "./ui";

/** one public lobby: settings and counts only, never a nickname */
function OpenRoomRow(props: {
  room: OpenRoomEntry;
  disabled: boolean;
  onJoin: (code: string) => void;
}): JSXElement {
  const summary = () => settingsSummary(props.room.settings);
  const bots = () => botsText(props.room);
  return (
    <li
      class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded bg-bg px-4 py-2"
      data-testid="mp-open-room"
      data-code={props.room.code}
    >
      <span class="min-w-0 grow truncate font-(--font) text-text">
        {summary()}
      </span>
      <span
        class="font-(--font) text-text"
        title="players"
        data-testid="mp-open-room-humans"
      >
        <Fa icon="fa-user" /> {humansText(props.room)}
      </span>
      <Show when={bots()}>
        {(text) => (
          <span
            class="font-(--font) text-sub"
            title="bots"
            aria-label={`${props.room.bots} computer-controlled ${props.room.bots === 1 ? "bot" : "bots"}`}
            data-testid="mp-open-room-bots"
          >
            {text()}
          </span>
        )}
      </Show>
      <span class="text-sm text-sub" data-testid="mp-open-room-phase">
        {props.room.phase}
      </span>
      <span
        class="text-sm text-sub"
        aria-label={roomAgeAria(props.room.createdAgo)}
        data-testid="mp-open-room-age"
      >
        {roomAgeText(props.room.createdAgo)}
      </span>
      <Button
        text="join"
        fa={{ icon: "fa-sign-in-alt" }}
        class={PRIMARY_BUTTON}
        ariaLabel={`join ${summary()} lobby, ${props.room.humans} of ${props.room.maxPlayers} players`}
        disabled={props.disabled || props.room.phase !== "lobby"}
        dataset={{ "data-testid": "mp-open-room-join" }}
        onClick={() => props.onJoin(props.room.code)}
      />
    </li>
  );
}

/** the public lobby list, or a loading / empty state */
export function OpenRoomsList(props: {
  list: RoomsList | undefined;
  disabled: boolean;
  onJoin: (code: string) => void;
}): JSXElement {
  return (
    <Show
      when={props.list}
      fallback={
        <div class="text-sub" data-testid="mp-open-rooms-loading">
          <Fa icon="fa-circle-notch" spin /> loading open rooms...
        </div>
      }
    >
      {(list) => (
        <>
          <div
            class="text-sm text-sub"
            aria-live="polite"
            data-testid="mp-open-rooms-status"
          >
            {openRoomsStatus(list())}
          </div>
          <Show
            when={list().rooms.length > 0}
            fallback={
              <div class="text-sub" data-testid="mp-open-rooms-empty">
                no open rooms yet — open your lobby to list it
              </div>
            }
          >
            <ul class="grid gap-2" aria-label="open rooms">
              <For each={list().rooms}>
                {(room) => (
                  <OpenRoomRow
                    room={room}
                    disabled={props.disabled}
                    onJoin={props.onJoin}
                  />
                )}
              </For>
            </ul>
          </Show>
        </>
      )}
    </Show>
  );
}
