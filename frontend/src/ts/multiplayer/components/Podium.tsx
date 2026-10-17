import { For, JSXElement, Show } from "solid-js";

import type { RaceResult, RoomState } from "../protocol";

import { Button } from "../../components/common/Button";
import { Fa } from "../../components/common/Fa";
import { PUG_WINNER_FILE } from "../../components/pages/test/pug-frames";
import { cn } from "../../utils/cn";
import { leaveRoom, rematch } from "../race";
import { isHost, myId } from "../store";
import { KickButton } from "./KickButton";
import { PugImage } from "./PugImage";
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
  const winner = () => props.results[0];
  const dense = () => props.results.length > 4;
  const mine = () => props.results.find((r) => r.playerId === myId());

  return (
    <div
      class="grid items-center gap-8 md:grid-cols-[2fr_3fr]"
      data-testid="mp-podium"
    >
      <PugImage
        file={PUG_WINNER_FILE}
        class={cn(
          "mx-auto aspect-square w-full",
          dense() ? "max-w-48 md:max-w-80" : "max-w-80",
        )}
        testId="mp-pug-winner"
      />
      <div class="grid gap-4">
        <div class="text-sm font-(--font) text-sub">
          race over · private · {props.room.code} ·{" "}
          {settingsSummary(props.room.settings)}
        </div>
        <Show when={winner()}>
          {(w) => (
            <h2
              class="text-4xl leading-tight break-words sm:text-5xl"
              data-testid="mp-winner"
            >
              <span class={PLAYER_TEXT[colorOf(w().playerId)]}>{w().name}</span>{" "}
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
        <div class="overflow-x-auto rounded-lg bg-sub-alt px-2 py-2 sm:px-4">
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
                      <span class="flex min-w-0 items-center gap-2">
                        <span
                          class={cn(
                            "h-2.5 w-2.5 shrink-0 rounded-full",
                            PLAYER_BG[colorOf(r.playerId)],
                          )}
                        ></span>
                        <span class="truncate text-text">{r.name}</span>
                        <Show when={r.playerId === myId()}>
                          <span class="shrink-0 text-sm text-sub">(you)</span>
                        </Show>
                        <Show when={!r.finished}>
                          <span class="shrink-0 text-sm text-sub">dnf</span>
                        </Show>
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
                        <KickButton
                          room={props.room}
                          playerId={r.playerId}
                          name={r.name}
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
