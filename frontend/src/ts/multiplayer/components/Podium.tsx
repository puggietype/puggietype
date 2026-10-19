import { For, JSXElement, Show } from "solid-js";

import type { RaceResult, RoomState } from "../protocol";

import { Button } from "../../components/common/Button";
import { Fa } from "../../components/common/Fa";
import {
  characterName,
  DEFAULT_CHARACTER,
} from "../../components/pages/test/character-frames";
import { cn } from "../../utils/cn";
import { displayName, isBot } from "../bots";
import { roomKindLabel } from "../helpers";
import { leaveRoom, rematch } from "../race";
import { characterSelectOn, isHost, myId } from "../store";
import { CharacterImage } from "./CharacterImage";
import { KickButton } from "./KickButton";
import { PlayerName } from "./PlayerName";
import { ReportButton } from "./ReportButton";
import {
  ordinal,
  PLAYER_BG,
  PLAYER_TEXT,
  settingsSummary,
  PRIMARY_BUTTON,
} from "./ui";

const REASON_TEXT: Record<RaceResult["reasons"][number], string> = {
  wpm_mismatch: "reported wpm didn't match",
  wpm_too_high: "wpm over 300",
  progress_jump: "progress jumped too fast",
  finish_before_start: "finished before the start",
  keycount_low: "too few keystrokes",
  progress_missing: "no progress sent",
};

/** race results: winner pug, table, rematch / leave */
export function Podium(props: {
  room: RoomState;
  results: RaceResult[];
}): JSXElement {
  const colorOf = (id: string) =>
    props.room.players.find((p) => p.id === id)?.color ?? "opp1";
  const dogOf = (id: string) =>
    props.room.players.find((p) => p.id === id)?.character ?? DEFAULT_CHARACTER;
  const winner = () => props.results[0];
  const winnerDog = () => {
    const w = winner();
    return w ? dogOf(w.playerId) : DEFAULT_CHARACTER;
  };
  /** the podium dog is the one image with alt text (rows are decorative) */
  const winnerAlt = (): string | undefined => {
    const w = winner();
    if (!characterSelectOn() || w === undefined) return undefined;
    return `${displayName(w)}'s ${characterName(winnerDog())}`;
  };
  const dense = () => props.results.length > 4;
  const mine = () => props.results.find((r) => r.playerId === myId());

  return (
    <div
      // side by side only from xl: below that the table needs the full width for names
      class="mx-auto grid w-full max-w-3xl items-center gap-8 xl:max-w-none xl:grid-cols-[2fr_3fr]"
      data-testid="mp-podium"
    >
      <CharacterImage
        character={winnerDog()}
        frame="winner"
        class={cn(
          "mx-auto aspect-square w-full",
          dense() ? "max-w-40 xl:max-w-80" : "max-w-56 xl:max-w-80",
        )}
        testId="mp-pug-winner"
        alt={winnerAlt()}
      />
      <div class="grid gap-4">
        <div class="text-sm font-(--font) text-sub">
          race over · {roomKindLabel(props.room)} · {props.room.code} ·{" "}
          {settingsSummary(props.room.settings)}
        </div>
        <Show when={winner()}>
          {(w) => (
            <h2
              class="text-4xl leading-tight break-words sm:text-5xl"
              data-testid="mp-winner"
            >
              <span class={PLAYER_TEXT[colorOf(w().playerId)]}>
                <PlayerName player={w()} />
              </span>{" "}
              <span class="text-text">wins!</span>
            </h2>
          )}
        </Show>
        <Show when={mine()}>
          {(m) => (
            <div class="text-sub">
              you placed{" "}
              <span class="text-main" data-testid="mp-my-place">
                {ordinal(m().place)}
              </span>
              {m().finished ? "" : " · didn't finish"}
            </div>
          )}
        </Show>
        {/* no overflow clip: the report menu pops out of a row; relative z-10 keeps it above the buttons below */}
        <div class="relative z-10 rounded-lg bg-sub-alt px-2 py-2 sm:px-4">
          <table class="w-full font-(--font)" data-testid="mp-results-table">
            <thead>
              <tr class="text-left text-xs text-sub">
                <th class="px-2 py-3 font-normal sm:px-3">#</th>
                <th class="w-full px-2 py-3 font-normal sm:px-3">typist</th>
                <th class="px-2 py-3 text-right font-normal sm:px-3">wpm</th>
                <th class="hidden px-2 py-3 text-right font-normal sm:table-cell sm:px-3">
                  raw
                </th>
                <th class="px-2 py-3 text-right font-normal sm:px-3">acc</th>
                <th class="hidden px-3 py-3 text-right font-normal sm:table-cell">
                  flagged
                </th>
              </tr>
            </thead>
            <tbody>
              <For each={props.results}>
                {(r) => (
                  <tr
                    class="border-t border-bg"
                    data-testid="mp-result-row"
                    data-player-id={r.playerId}
                    data-place={r.place}
                  >
                    <td
                      class={cn(
                        "px-2 text-lg sm:px-3",
                        dense() ? "py-1.5" : "py-3",
                        PLAYER_TEXT[colorOf(r.playerId)],
                      )}
                    >
                      {r.place}
                    </td>
                    <td
                      class={cn(
                        "max-w-0 px-2 sm:px-3",
                        dense() ? "py-1.5" : "py-3",
                      )}
                    >
                      {/* wraps: only flag/report/kick drop below; name + (you)/dnf stay on one line */}
                      <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          class={cn(
                            "flex max-w-full items-center gap-2",
                            // humans truncate; a bot's group never shrinks below min-content
                            isBot(r) ? "min-w-min" : "min-w-0",
                          )}
                        >
                          <span
                            class={cn(
                              "h-2.5 w-2.5 shrink-0 rounded-full",
                              PLAYER_BG[colorOf(r.playerId)],
                            )}
                          ></span>
                          <Show when={characterSelectOn()}>
                            <CharacterImage
                              character={dogOf(r.playerId)}
                              frame="head"
                              class="h-7 w-8 shrink-0"
                              testId="mp-result-character"
                            />
                          </Show>
                          <span
                            class={cn(
                              "leading-tight text-text",
                              // bot halves may wrap between them, never inside
                              isBot(r) ? "min-w-min" : "min-w-0 truncate",
                            )}
                            title={r.name}
                            aria-label={isBot(r) ? displayName(r) : undefined}
                            data-testid="mp-result-name"
                          >
                            <PlayerName player={r} />
                          </span>
                          <Show when={r.playerId === myId()}>
                            <span class="shrink-0 text-sm text-sub">(you)</span>
                          </Show>
                          <Show when={!r.finished}>
                            <span class="shrink-0 text-sm text-sub">dnf</span>
                          </Show>
                        </span>
                        <Show when={r.flagged}>
                          <span
                            class="shrink-0 text-sm text-error sm:hidden"
                            title={r.reasons
                              .map((x) => REASON_TEXT[x])
                              .join(", ")}
                          >
                            <Fa icon="fa-flag" />
                          </span>
                        </Show>
                        <ReportButton
                          room={props.room}
                          align="left"
                          player={{
                            id: r.playerId,
                            name: r.name,
                            isBot: r.isBot,
                          }}
                        />
                        <KickButton
                          room={props.room}
                          playerId={r.playerId}
                          name={displayName(r)}
                        />
                      </span>
                    </td>
                    <td
                      class={cn(
                        "px-2 text-right text-text sm:px-3",
                        dense() ? "py-1.5" : "py-3",
                      )}
                      data-testid="mp-result-wpm"
                    >
                      {Math.round(r.wpm)}
                    </td>
                    <td
                      class={cn(
                        "hidden px-2 text-right text-sub sm:table-cell sm:px-3",
                        dense() ? "py-1.5" : "py-3",
                      )}
                    >
                      {Math.round(r.raw)}
                    </td>
                    <td
                      class={cn(
                        "px-2 text-right text-text sm:px-3",
                        dense() ? "py-1.5" : "py-3",
                      )}
                    >
                      {r.acc.toFixed(1)}%
                    </td>
                    <td
                      class={cn(
                        "hidden px-3 text-right sm:table-cell",
                        dense() ? "py-1.5" : "py-3",
                      )}
                    >
                      <Show
                        when={r.flagged}
                        fallback={<span class="text-sub">-</span>}
                      >
                        <span
                          class="text-error"
                          title={r.reasons
                            .map((x) => REASON_TEXT[x])
                            .join(", ")}
                          data-testid="mp-result-flagged"
                        >
                          <Fa icon="fa-flag" /> {r.reasons.length}
                        </span>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Show
            when={isHost()}
            fallback={
              <span class="text-sub" data-testid="mp-waiting-host">
                <Fa icon="fa-hourglass-half" /> waiting for the host to start a
                rematch
              </span>
            }
          >
            <Button
              text="rematch"
              fa={{ icon: "fa-redo-alt" }}
              class={cn(PRIMARY_BUTTON, "px-5 py-3")}
              dataset={{ "data-testid": "mp-rematch" }}
              onClick={() => rematch()}
            />
          </Show>
          <Button
            text="leave"
            fa={{ icon: "fa-sign-out-alt" }}
            class="px-5 py-3"
            dataset={{ "data-testid": "mp-leave" }}
            onClick={() => leaveRoom()}
          />
        </div>
      </div>
    </div>
  );
}
