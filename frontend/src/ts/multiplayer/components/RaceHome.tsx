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
import { getClientId } from "../client-id";
import { isFlagEnabled } from "../feature-flags";
import { PUBLIC_MATCHES_ENABLED } from "../flags";
import { normalizeRoomCode } from "../helpers";
import { MAX_PLAYERS } from "../protocol";
import {
  connect,
  createRoom,
  joinQueue,
  joinRoom,
  unwatchOpenRooms,
  watchOpenRooms,
} from "../race";
import { recentClaimedWpm } from "../recent-pace";
import {
  connectionStatus,
  openRooms,
  openRoomsOn,
  quickMatchOn,
} from "../store";
import { OpenRoomsList } from "./OpenRoomsList";
import { PRIMARY_BUTTON } from "./ui";
import { Visibility, VisibilityChoice } from "./VisibilityChoice";

const CARD = "grid gap-3 rounded-lg bg-sub-alt p-6";
const LABEL = "text-sm tracking-wide text-sub";
const INPUT =
  "w-full rounded bg-bg px-4 py-3 font-(--font) text-text placeholder:text-sub";

export function RaceHome(props: { code?: string }): JSXElement {
  // initial value only, the field is user-editable afterwards
  const [code, setCode] = createSignal(untrack(() => props.code) ?? "");

  // never remembered: every visit to the hub starts private
  const [visibility, setVisibility] = createSignal<Visibility>("private");
  const validCode = (): string | undefined => normalizeRoomCode(code());
  const busy = (): boolean => connectionStatus() === "connecting";

  const withConnection = (action: () => void): void => {
    connect();
    action();
  };

  // no-op unless the openRooms client flag is on
  onMount(watchOpenRooms);
  // learn the server's features so Quick Match can show up
  onMount(() => {
    if (isFlagEnabled("quickMatch")) connect();
  });

  const [findingPace, setFindingPace] = createSignal(false);
  const findMatch = (): void => {
    // QM-009: mint/store the Quick Match id synchronously on click, before any await
    getClientId();
    setFindingPace(true);
    void recentClaimedWpm().then((wpm) => {
      setFindingPace(false);
      joinQueue(wpm);
    });
  };
  onCleanup(unwatchOpenRooms);

  return (
    <div class="grid gap-6 md:grid-cols-[3fr_2fr]">
      <div class="grid content-start gap-6">
        <section class={CARD}>
          <h2 class={LABEL}>create a room</h2>
          <div class="text-sub">
            race up to {MAX_PLAYERS} typists with an invite link. you get a
            random pug name.
          </div>
          <Show when={openRoomsOn()}>
            <VisibilityChoice
              value={visibility()}
              onChange={(v) => setVisibility(v)}
            />
          </Show>
          <div class="flex justify-end">
            <Button
              text="Create room"
              fa={{ icon: "fa-plus" }}
              class={cn(PRIMARY_BUTTON, "px-5 py-3")}
              disabled={busy()}
              dataset={{ "data-testid": "mp-create" }}
              onClick={() => {
                const open = openRoomsOn() && visibility() === "open";
                withConnection(() => createRoom(undefined, { open }));
              }}
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
        <Show when={quickMatchOn()}>
          <section class={CARD} data-testid="mp-quick-match">
            <div class={LABEL}>quick play</div>
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div class="text-lg text-text">quick match</div>
                <div class="text-sm text-sub">
                  race strangers at your pace · time 30 · english
                </div>
              </div>
              <Button
                text="find match"
                fa={{ icon: "fa-globe" }}
                class={cn(PRIMARY_BUTTON, "px-5 py-3")}
                disabled={busy() || findingPace()}
                dataset={{ "data-testid": "mp-public" }}
                onClick={findMatch}
              />
            </div>
          </section>
        </Show>
        <Show when={!quickMatchOn()}>
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
        </Show>
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
