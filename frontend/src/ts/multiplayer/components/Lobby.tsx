import {
  createEffect,
  createSignal,
  For,
  JSXElement,
  onCleanup,
  Show,
} from "solid-js";

import { Button } from "../../components/common/Button";
import { Fa } from "../../components/common/Fa";
import {
  characterName,
  DEFAULT_CHARACTER,
  prefetchCharacters,
} from "../../components/pages/test/character-frames";
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { cn } from "../../utils/cn";
import { botMixText, displayName, isBot, showBotBadge } from "../bots";
import { isFlagEnabled } from "../feature-flags";
import { canStartRace, inviteLink } from "../helpers";
import {
  MAX_PLAYERS,
  TIME_MODE2,
  WORDS_MODE2,
  type RoomState,
  type SettingsPatch,
} from "../protocol";
import {
  leaveRoom,
  rerollName,
  setReady,
  setRoomOpen,
  startRace,
  updateSettings,
} from "../race";
import {
  characterSelectOn,
  isHost,
  myCharacter,
  myId,
  openRoomsOn,
} from "../store";
import { CharacterImage } from "./CharacterImage";
import { CharacterPicker } from "./CharacterPicker";
import { KickButton } from "./KickButton";
import { PlayerName } from "./PlayerName";
import { ReportButton } from "./ReportButton";
import { LANGUAGES, PLAYER_BG, settingsSummary, PRIMARY_BUTTON } from "./ui";

// below md the implicit grid column's min-content would push cards past a
// narrow viewport: pin it to the container and tighten the padding
const CARD =
  "grid content-start gap-4 rounded-lg bg-sub-alt p-6 max-md:grid-cols-[minmax(0,1fr)] max-sm:p-4";
const LABEL = "text-sm tracking-wide text-sub";
const REROLL_COOLDOWN_MS = 2000;

function OptionButton(props: {
  text: string;
  active: boolean;
  disabled: boolean;
  testId: string;
  onClick: () => void;
}): JSXElement {
  return (
    <Button
      variant="text"
      text={props.text}
      active={props.active}
      disabled={props.disabled}
      class={cn("px-3 py-1.5 font-(--font)", {
        "pointer-events-none opacity-100": props.disabled,
        "opacity-40": props.disabled && !props.active,
      })}
      dataset={{ "data-testid": props.testId }}
      onClick={props.onClick}
    />
  );
}

export function Lobby(props: { room: RoomState }): JSXElement {
  const me = () => props.room.players.find((p) => p.id === myId());
  const link = () => inviteLink(window.location.origin, props.room.code);
  const readOnly = () => !isHost();
  const s = () => props.room.settings;
  const lengths = (): readonly number[] =>
    s().mode === "time" ? TIME_MODE2 : WORDS_MODE2;
  const change = (patch: SettingsPatch): void => {
    if (!readOnly()) updateSettings(patch);
  };

  // the server allows 5 rerolls per 10 s and drops the rest silently
  const [rerollCooling, setRerollCooling] = createSignal(false);
  let rerollTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(rerollTimer));
  const reroll = (): void => {
    rerollName();
    setRerollCooling(true);
    rerollTimer = setTimeout(() => setRerollCooling(false), REROLL_COOLDOWN_MS);
  };

  // opponents' race frames, so the first race frame never waits on them
  createEffect(() => {
    if (!isFlagEnabled("opponentDogs")) return;
    prefetchCharacters(
      props.room.players.filter((p) => p.id !== myId()).map((p) => p.character),
      ["idle", "left", "right", "winnerSmall"],
    );
  });

  /** slot number badge when someone else has the same dog */
  const sharesDog = (id: string): boolean => {
    const dog = props.room.players.find((p) => p.id === id)?.character;
    return props.room.players.some((p) => p.id !== id && p.character === dog);
  };

  const copyInvite = (): void => {
    navigator.clipboard
      .writeText(link())
      .then(() => showSuccessNotification("Invite link copied"))
      .catch(() => showErrorNotification("Could not copy the invite link"));
  };

  const startHint = (): string => {
    if (props.room.players.length < 2) return "waiting for someone to join";
    if (!canStartRace(props.room, myId() ?? "")) {
      return isHost() ? "waiting for everyone to ready up" : "";
    }
    return "everyone is ready";
  };

  return (
    <div
      class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[1fr_1fr] xl:grid-cols-[3fr_2fr]"
      data-testid="mp-lobby"
    >
      <div class="grid content-start gap-6 max-md:grid-cols-[minmax(0,1fr)]">
        <section class={CARD}>
          <Show
            when={openRoomsOn()}
            fallback={<div class={LABEL}>private match</div>}
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class={LABEL}>
                {props.room.open ? "open match" : "private match"}
              </div>
              <Show
                when={isHost()}
                fallback={
                  <span
                    class={cn(
                      "rounded-full px-3 py-0.5 text-xs font-(--font)",
                      props.room.open ? "bg-main text-bg" : "bg-bg text-sub",
                    )}
                    data-testid="mp-open-badge"
                  >
                    {props.room.open ? "open" : "private"}
                  </span>
                }
              >
                <label class="flex cursor-pointer items-center gap-2 text-sm text-sub">
                  <input
                    type="checkbox"
                    role="switch"
                    class="size-4 cursor-pointer accent-main"
                    data-testid="mp-open-toggle"
                    checked={props.room.open}
                    disabled={props.room.phase !== "lobby"}
                    onChange={(e) => {
                      const open = e.currentTarget.checked;
                      // show the server's state until room:state confirms
                      e.currentTarget.checked = props.room.open;
                      setRoomOpen(open);
                    }}
                  />
                  {
                    "List in Open Rooms: anyone can see this room's code and join"
                  }
                </label>
              </Show>
            </div>
          </Show>
          <div class="flex flex-wrap items-center gap-4">
            <div
              // 8 letter-spaced chars: shrink with the viewport on phones
              class="grow rounded bg-bg px-5 py-3 text-4xl font-(--font) tracking-[0.3em] whitespace-nowrap text-text max-sm:px-3 max-sm:text-[length:clamp(1.25rem,calc((100vw_-_6rem)/6.5),2.25rem)] max-sm:tracking-[0.15em]"
              data-testid="mp-room-code"
            >
              {props.room.code}
            </div>
            <Button
              text="copy invite"
              fa={{ icon: "fa-link" }}
              class="px-5 py-3"
              dataset={{ "data-testid": "mp-copy-invite" }}
              onClick={copyInvite}
            />
          </div>
          <div class="text-sub">
            share the code or link · up to {MAX_PLAYERS} typists ·{" "}
            <span class="text-main" data-testid="mp-settings-summary">
              {settingsSummary(s())}
            </span>
          </div>
        </section>

        <Show when={characterSelectOn()}>
          <CharacterPicker
            selected={me()?.character ?? DEFAULT_CHARACTER}
            locked={me()?.ready === true}
          />
        </Show>

        <section class={CARD} data-testid="mp-settings">
          <div class="flex items-center justify-between">
            <div class={LABEL}>race settings</div>
            <Show when={readOnly()}>
              <div class="text-sm text-sub">
                <Fa icon="fa-lock" /> host picks
              </div>
            </Show>
          </div>
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div class="flex">
              <OptionButton
                text="time"
                active={s().mode === "time"}
                disabled={readOnly()}
                testId="mp-mode-time"
                onClick={() => change({ mode: "time" })}
              />
              <OptionButton
                text="words"
                active={s().mode === "words"}
                disabled={readOnly()}
                testId="mp-mode-words"
                onClick={() => change({ mode: "words" })}
              />
            </div>
            <div class="flex">
              <For each={lengths()}>
                {(n) => (
                  <OptionButton
                    text={String(n)}
                    active={s().mode2 === n}
                    disabled={readOnly()}
                    testId={`mp-length-${n}`}
                    onClick={() => change({ mode2: n })}
                  />
                )}
              </For>
            </div>
            <div class="flex">
              <OptionButton
                text="punctuation"
                active={s().punctuation}
                disabled={readOnly()}
                testId="mp-punctuation"
                onClick={() => change({ punctuation: !s().punctuation })}
              />
              <OptionButton
                text="numbers"
                active={s().numbers}
                disabled={readOnly()}
                testId="mp-numbers"
                onClick={() => change({ numbers: !s().numbers })}
              />
            </div>
            <select
              class="max-w-full rounded bg-bg px-3 py-1.5 font-(--font) text-text disabled:opacity-100"
              data-testid="mp-language"
              aria-label="language"
              disabled={readOnly()}
              value={s().language}
              onChange={(e) => change({ language: e.currentTarget.value })}
            >
              <Show when={!LANGUAGES.some((l) => l === s().language)}>
                <option value={s().language}>{s().language}</option>
              </Show>
              <For each={LANGUAGES}>
                {(l) => <option value={l}>{l.replace(/_/g, " ")}</option>}
              </For>
            </select>
          </div>
        </section>
      </div>

      <section class={CARD}>
        <Show when={me()}>
          {(p) => (
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="text-sub">you are</span>
              <span
                class="max-w-full min-w-0 truncate text-xl font-(--font) text-main"
                data-testid="mp-my-name"
                title={p().name}
              >
                {p().name}
              </span>
              <Button
                variant="text"
                text="new name"
                fa={{ icon: "fa-dice" }}
                class="py-1 text-sm"
                disabled={rerollCooling()}
                dataset={{ "data-testid": "mp-reroll" }}
                onClick={reroll}
              />
            </div>
          )}
        </Show>
        <div class={LABEL} data-testid="mp-player-count">
          players · {props.room.players.length}/{MAX_PLAYERS}
          <Show when={botMixText(props.room.players)}>
            {(mix) => ` · ${mix()}`}
          </Show>
        </div>
        <ul
          class={cn(
            "grid",
            props.room.players.length > 4 ? "gap-1.5" : "gap-2",
          )}
          data-testid="mp-player-list"
        >
          <For each={props.room.players}>
            {(p) => (
              <li
                class={cn(
                  // wraps: pill + kick drop to a right-aligned 2nd line, never overlap the name
                  "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded bg-bg px-4",
                  props.room.players.length > 4 ? "py-2" : "py-3",
                  !p.connected && "opacity-50",
                )}
                data-testid="mp-player"
                data-player-id={p.id}
                data-ready={String(p.ready)}
              >
                {/* dot..crown stay on one line (name truncates); status wraps below */}
                <span class="flex max-w-full min-w-0 items-center gap-3">
                  <span
                    class={cn(
                      "h-3 w-3 shrink-0 rounded-full",
                      PLAYER_BG[p.color],
                    )}
                  ></span>
                  <Show when={characterSelectOn()}>
                    <span
                      class="relative shrink-0"
                      title={characterName(p.character)}
                    >
                      <CharacterImage
                        character={p.character}
                        frame="head"
                        class="h-7 w-8"
                        testId="mp-player-character"
                      />
                      <Show when={sharesDog(p.id)}>
                        <span
                          class={cn(
                            "absolute -right-1.5 -bottom-1 grid size-4 place-items-center rounded-full text-[0.625rem] leading-none font-bold text-bg",
                            PLAYER_BG[p.color],
                          )}
                          aria-hidden="true"
                        >
                          {p.color.slice(3)}
                        </span>
                      </Show>
                    </span>
                  </Show>
                  <span
                    class={cn(
                      "leading-tight font-(--font) text-text",
                      // humans keep the one-line truncate; bot names never shrink
                      // below min-content (halves may still wrap between them)
                      showBotBadge(p) ? "min-w-min" : "min-w-0 truncate",
                    )}
                    title={p.name}
                    aria-label={isBot(p) ? displayName(p) : undefined}
                  >
                    <PlayerName player={p} />
                  </span>
                  <Show when={p.id === myId()}>
                    <span class="shrink-0 text-sm text-sub">(you)</span>
                  </Show>
                  <Show when={p.id === props.room.hostId}>
                    <span
                      class="shrink-0 text-main"
                      title="host"
                      data-testid="mp-host-crown"
                    >
                      <Fa icon="fa-crown" />
                    </span>
                  </Show>
                </span>
                <span class="ml-auto flex shrink-0 items-center gap-3">
                  <Show
                    when={p.id !== props.room.hostId}
                    fallback={<span class="text-sm text-sub">host</span>}
                  >
                    <span
                      class={cn(
                        "rounded-full px-3 py-0.5 text-xs font-(--font) whitespace-nowrap",
                        p.ready ? "bg-opp2 text-bg" : "bg-sub-alt text-sub",
                      )}
                    >
                      {p.ready ? "ready" : "not ready"}
                    </span>
                  </Show>
                  <ReportButton room={props.room} player={p} />
                  <KickButton
                    room={props.room}
                    playerId={p.id}
                    name={displayName(p)}
                  />
                </span>
              </li>
            )}
          </For>
        </ul>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-sm text-sub" data-testid="mp-start-hint">
            {startHint()}
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              text="leave"
              fa={{ icon: "fa-sign-out-alt" }}
              variant="text"
              dataset={{ "data-testid": "mp-leave" }}
              onClick={() => leaveRoom()}
            />
            <Show
              when={isHost()}
              fallback={
                <Button
                  text={me()?.ready === true ? "ready!" : "ready up"}
                  fa={{ icon: me()?.ready === true ? "fa-check" : "fa-circle" }}
                  active={me()?.ready === true}
                  class="px-5"
                  dataset={{ "data-testid": "mp-ready" }}
                  onClick={() => setReady(me()?.ready !== true)}
                />
              }
            >
              <Button
                text="start race"
                fa={{ icon: "fa-flag-checkered" }}
                class={cn(PRIMARY_BUTTON, "px-5")}
                disabled={!canStartRace(props.room, myId() ?? "")}
                dataset={{ "data-testid": "mp-start" }}
                onClick={() => startRace()}
              />
            </Show>
          </div>
        </div>
        <CharacterImage
          character={myCharacter()}
          frame="idle"
          class="mx-auto mt-2 h-36 w-36"
        />
      </section>
    </div>
  );
}
