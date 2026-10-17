import { For, JSXElement, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import { Fa } from "../../components/common/Fa";
import { PUG_FRAME_FILES } from "../../components/pages/test/pug-frames";
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { cn } from "../../utils/cn";
import { canStartRace, inviteLink } from "../helpers";
import {
  TIME_MODE2,
  WORDS_MODE2,
  type RoomState,
  type SettingsPatch,
} from "../protocol";
import {
  leaveRoom,
  rerollName,
  setReady,
  startRace,
  updateSettings,
} from "../race";
import { isHost, myId } from "../store";
import { PugImage } from "./PugImage";
import { LANGUAGES, PLAYER_BG, settingsSummary, PRIMARY_BUTTON } from "./ui";

const CARD = "grid content-start gap-4 rounded-lg bg-sub-alt p-6";
const LABEL = "text-sm tracking-wide text-sub";

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
    <div class="grid gap-6 md:grid-cols-[3fr_2fr]" data-testid="mp-lobby">
      <div class="grid content-start gap-6">
        <section class={CARD}>
          <div class={LABEL}>private match</div>
          <div class="flex flex-wrap items-center gap-4">
            <div
              class="grow rounded bg-bg px-5 py-3 text-4xl font-(--font) tracking-[0.3em] text-text"
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
            share the code or link · up to 4 typists ·{" "}
            <span class="text-main" data-testid="mp-settings-summary">
              {settingsSummary(s())}
            </span>
          </div>
        </section>

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
              class="rounded bg-bg px-3 py-1.5 font-(--font) text-text disabled:opacity-100"
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
                class="text-xl font-(--font) text-main"
                data-testid="mp-my-name"
              >
                {p().name}
              </span>
              <Button
                variant="text"
                text="new name"
                fa={{ icon: "fa-dice" }}
                class="py-1 text-sm"
                dataset={{ "data-testid": "mp-reroll" }}
                onClick={() => rerollName()}
              />
            </div>
          )}
        </Show>
        <div class={LABEL}>players · {props.room.players.length}/4</div>
        <ul class="grid gap-2">
          <For each={props.room.players}>
            {(p) => (
              <li
                class={cn(
                  "flex items-center gap-3 rounded bg-bg px-4 py-3",
                  !p.connected && "opacity-50",
                )}
                data-testid="mp-player"
                data-player-id={p.id}
                data-ready={String(p.ready)}
              >
                <span
                  class={cn(
                    "h-3 w-3 shrink-0 rounded-full",
                    PLAYER_BG[p.color],
                  )}
                ></span>
                <span class="truncate font-(--font) text-text">{p.name}</span>
                <Show when={p.id === myId()}>
                  <span class="text-sm text-sub">(you)</span>
                </Show>
                <Show when={p.id === props.room.hostId}>
                  <span
                    class="text-main"
                    title="host"
                    data-testid="mp-host-crown"
                  >
                    <Fa icon="fa-crown" />
                  </span>
                </Show>
                <span class="grow"></span>
                <Show
                  when={p.id !== props.room.hostId}
                  fallback={<span class="text-sm text-sub">host</span>}
                >
                  <span
                    class={cn(
                      "rounded-full px-3 py-0.5 text-xs font-(--font)",
                      p.ready ? "bg-opp2 text-bg" : "bg-sub-alt text-sub",
                    )}
                  >
                    {p.ready ? "ready" : "not ready"}
                  </span>
                </Show>
              </li>
            )}
          </For>
        </ul>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-sm text-sub" data-testid="mp-start-hint">
            {startHint()}
          </div>
          <div class="flex gap-2">
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
        <PugImage file={PUG_FRAME_FILES.idle} class="mx-auto mt-2 h-36 w-36" />
      </section>
    </div>
  );
}
