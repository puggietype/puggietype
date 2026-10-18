import {
  createSignal,
  JSXElement,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";

import { Button } from "../../components/common/Button";
import { PugHead } from "../../components/common/PugHead";
import { showNoticeNotification } from "../../states/notifications";
import { cn } from "../../utils/cn";
import { PUBLIC_MATCHES_ENABLED } from "../flags";
import { normalizeRoomCode } from "../helpers";
import { MAX_PLAYERS } from "../protocol";
import {
  connect,
  createRoom,
  joinRoom,
  unwatchOpenRooms,
  watchOpenRooms,
} from "../race";
import { connectionStatus, openRooms, openRoomsOn } from "../store";
import { OpenRoomsList } from "./OpenRoomsList";
import { PRIMARY_BUTTON } from "./ui";

const CARD = "grid gap-3 rounded-lg bg-sub-alt p-6";
const LABEL = "text-sm tracking-wide text-sub";
const INPUT =
  "w-full rounded bg-bg px-4 py-3 font-(--font) text-text placeholder:text-sub";

export function RaceHome(props: { code?: string }): JSXElement {
  // initial value only, the field is user-editable afterwards
  const [code, setCode] = createSignal(untrack(() => props.code) ?? "");

  const validCode = (): string | undefined => normalizeRoomCode(code());
  const busy = (): boolean => connectionStatus() === "connecting";

  const withConnection = (action: () => void): void => {
    connect();
    action();
  };

  // no-op unless the openRooms client flag is on
  onMount(watchOpenRooms);
  onCleanup(unwatchOpenRooms);

  return (
    <div class="grid gap-6 md:grid-cols-[3fr_2fr]">
      <div class="grid content-start gap-6">
        <section class={CARD}>
          <div class={LABEL}>private match</div>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="text-sub">
              race up to {MAX_PLAYERS} typists with an invite link. you get a
              random pug name.
            </div>
            <Button
              text="create private lobby"
              fa={{ icon: "fa-plus" }}
              class={cn(PRIMARY_BUTTON, "px-5 py-3")}
              disabled={busy()}
              dataset={{ "data-testid": "mp-create" }}
              onClick={() => withConnection(() => createRoom())}
            />
          </div>
        </section>
        <section class={CARD}>
          <label class={LABEL} for="mpJoinCode">
            join by code
          </label>
          <form
            class="flex gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const c = validCode();
              if (c !== undefined) withConnection(() => joinRoom(c));
            }}
          >
            <input
              id="mpJoinCode"
              class={`${INPUT} text-xl tracking-[0.3em] uppercase`}
              data-testid="mp-join-code"
              maxLength={9}
              placeholder="ABCD2345"
              value={code()}
              onInput={(e) => setCode(e.currentTarget.value)}
            />
            <Button
              type="submit"
              text="join"
              fa={{ icon: "fa-sign-in-alt" }}
              class={cn(PRIMARY_BUTTON, "px-5")}
              disabled={validCode() === undefined || busy()}
              dataset={{ "data-testid": "mp-join" }}
            />
          </form>
        </section>
        <Show when={openRoomsOn()}>
          <section class={CARD} data-testid="mp-open-rooms">
            <h2 class={LABEL}>open rooms</h2>
            <OpenRoomsList
              list={openRooms()}
              disabled={busy()}
              onJoin={(c) => withConnection(() => joinRoom(c))}
            />
          </section>
        </Show>
        <section class={CARD}>
          <div class={LABEL}>quick play</div>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div class="text-lg text-text">public match</div>
              <Show when={!PUBLIC_MATCHES_ENABLED}>
                <div
                  class="text-sm font-(--font) text-sub"
                  data-testid="mp-public-soon"
                >
                  coming soon
                </div>
              </Show>
            </div>
            <Button
              text="find match"
              fa={{ icon: "fa-globe" }}
              disabled={!PUBLIC_MATCHES_ENABLED}
              dataset={{ "data-testid": "mp-public" }}
              onClick={() =>
                showNoticeNotification(
                  "Public matchmaking isn't on this server yet.",
                )
              }
            />
          </div>
        </section>
      </div>
      <section class="hidden content-center justify-items-center gap-4 rounded-lg bg-sub-alt p-6 text-center text-sub md:grid">
        <PugHead class="h-24 w-24" />
        <div class="text-2xl text-text">race your friends</div>
        <div>
          same words, same settings, live carets. first to the finish (or the
          fastest in time mode) wins.
        </div>
      </section>
    </div>
  );
}
