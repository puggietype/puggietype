import { createMemo, For, JSXElement, Show } from "solid-js";

import type { RaceResult, RoomState } from "../protocol";

import { Button } from "../../components/common/Button";
import { Fa } from "../../components/common/Fa";
import {
  characterName,
  DEFAULT_CHARACTER,
} from "../../components/pages/test/character-frames";
import { getTheme } from "../../states/theme";
import { cn } from "../../utils/cn";
import { displayName, isBot } from "../bots";
import { canStartRace, readyCount, roomKindLabel } from "../helpers";
import { backToLobby, leaveRoom, rematch, setReady, startRace } from "../race";
import { selfHighlight, selfPillText } from "../self-highlight";
import { characterSelectOn, isHost, myId, resultsReadyOn } from "../store";
import { CharacterImage } from "./CharacterImage";
import { KickButton } from "./KickButton";
import { PlayerName } from "./PlayerName";
import { ReadyBadge } from "./ReadyBadge";
import { ReadyButton } from "./ReadyButton";
import { ReadyCount } from "./ReadyCount";
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

/** your own row / placed line: main-color tint and a 4px inset bar (no layout shift) */
const SELF_TINT =
  "bg-[color-mix(in_srgb,var(--main-color)_var(--self-tint),transparent)]";
const SELF_BAR = "shadow-[inset_4px_0_0_var(--main-color)]";

/** main-color "You" pill; text color picked per theme for contrast. visual only, sr text says "(you)" */
function YouPill(props: { testId: string }): JSXElement {
  return (
    <span
      class="shrink-0 rounded bg-main px-1.5 text-xs leading-4 font-bold text-(--self-pill-text)"
      aria-hidden="true"
      data-testid={props.testId}
    >
      You
    </span>
  );
}

/** race results: winner pug, table, ready / start next race (or rematch) / leave */
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
  const seat = (id: string) => props.room.players.find((p) => p.id === id);
  const meReady = () => seat(myId() ?? "")?.ready === true;
  const isMe = (id: string) => id === myId();
  /** SH-01: tint strength + which colors on your row fall back to text so all of them stay AA */
  const hl = createMemo(() => selfHighlight(getTheme(), getTheme().name));
  const subCls = (id: string) =>
    isMe(id) && hl().subToText ? "text-text" : "text-sub";
  const errCls = (id: string) =>
    isMe(id) && hl().errorToText ? "text-text" : "text-error";
  const rankCls = (id: string) =>
    isMe(id) && hl().playerToText.has(colorOf(id))
      ? "text-text"
      : PLAYER_TEXT[colorOf(id)];

  return (
    <div
      // side by side from a 1280px viewport; below that the table needs the full width for names.
      // arbitrary min-[1280px]: our xl is 1361px (tailwind.css @theme), not Tailwind's default 1280
      class="mx-auto grid w-full max-w-3xl grid-cols-[minmax(0,1fr)] items-center gap-8 min-[1280px]:max-w-none min-[1280px]:grid-cols-[2fr_3fr]"
      data-testid="mp-podium"
      style={{
        "--self-tint": `${hl().pct}%`,
        "--self-pill-text": selfPillText(getTheme()),
      }}
    >
      <CharacterImage
        character={winnerDog()}
        frame="winner"
        class={cn(
          "mx-auto aspect-square w-full",
          dense()
            ? "max-w-40 min-[1280px]:max-w-80"
            : "max-w-56 min-[1280px]:max-w-80",
        )}
        testId="mp-pug-winner"
        alt={winnerAlt()}
      />
      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 min-[1280px]:gap-3">
        <div class="text-sm font-(--font) text-sub">
          race over · {roomKindLabel(props.room)} · {props.room.code} ·{" "}
          {settingsSummary(props.room.settings)}
        </div>
        <Show when={winner()}>
          {(w) => (
            <h2
              // QM-008: only the name is clamped (3 lines, 2 from 1280) so the "winner" label always shows;
              // a slightly smaller name from 1280 keeps rematch/leave above the fold at 1280x800
              class="grid min-w-0 gap-1 leading-tight"
              title={`${displayName(w())} wins!`}
              aria-label={`${displayName(w())}${isMe(w().playerId) ? " (you)" : ""} wins!`}
              data-testid="mp-winner"
              data-self={isMe(w().playerId) ? "true" : undefined}
            >
              <span
                class="flex items-center gap-2 text-sm font-(--font) text-sub"
                aria-hidden="true"
                data-testid="mp-winner-label"
              >
                winner
                <Show when={isMe(w().playerId)}>
                  <YouPill testId="mp-winner-you" />
                </Show>
              </span>
              <span
                class={cn(
                  "line-clamp-3 min-w-0 text-4xl [overflow-wrap:anywhere] sm:text-5xl min-[1280px]:line-clamp-2 min-[1280px]:text-4xl min-[1440px]:text-5xl",
                  PLAYER_TEXT[colorOf(w().playerId)],
                )}
                aria-hidden="true"
                data-testid="mp-winner-name"
              >
                <PlayerName player={w()} />
              </span>
            </h2>
          )}
        </Show>
        <Show when={mine()}>
          {(m) => (
            <div
              class={cn(
                "justify-self-start rounded py-1 pr-3 pl-4 text-text",
                SELF_TINT,
                SELF_BAR,
              )}
              data-testid="mp-my-placed"
            >
              you placed{" "}
              <span
                class="rounded bg-main px-1.5 font-bold text-(--self-pill-text)"
                data-testid="mp-my-place"
              >
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
                    class={cn(
                      "border-t border-bg",
                      isMe(r.playerId) && SELF_TINT,
                    )}
                    data-testid="mp-result-row"
                    data-player-id={r.playerId}
                    data-place={r.place}
                    data-self={isMe(r.playerId) ? "true" : undefined}
                    aria-current={isMe(r.playerId) ? "true" : undefined}
                  >
                    <td
                      class={cn(
                        "px-2 text-lg sm:px-3",
                        dense() ? "py-1.5 min-[1280px]:py-1" : "py-3",
                        rankCls(r.playerId),
                        isMe(r.playerId) && SELF_BAR,
                      )}
                    >
                      {r.place}
                    </td>
                    <td
                      class={cn(
                        "max-w-0 px-2 sm:px-3",
                        dense() ? "py-1.5 min-[1280px]:py-1" : "py-3",
                      )}
                    >
                      {/* wraps: only flag/report/kick drop below; name + You/dnf stay on one line */}
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
                              isMe(r.playerId) && "font-bold",
                              // bot halves may wrap between them, never inside
                              isBot(r) ? "min-w-min" : "min-w-0 truncate",
                            )}
                            title={r.name}
                            aria-label={isBot(r) ? displayName(r) : undefined}
                            data-testid="mp-result-name"
                          >
                            <PlayerName player={r} />
                          </span>
                          <Show when={isMe(r.playerId)}>
                            <YouPill testId="mp-result-you" />
                            <span class="sr-only">(you)</span>
                          </Show>
                          <Show when={!r.finished}>
                            <span
                              class={cn("shrink-0 text-sm", subCls(r.playerId))}
                            >
                              dnf
                            </span>
                          </Show>
                        </span>
                        <Show
                          when={
                            resultsReadyOn() &&
                            r.playerId !== props.room.hostId &&
                            !r.isBot &&
                            seat(r.playerId)
                          }
                        >
                          {(p) => <ReadyBadge player={p()} />}
                        </Show>
                        <Show when={r.flagged}>
                          <span
                            class={cn(
                              "shrink-0 text-sm sm:hidden",
                              errCls(r.playerId),
                            )}
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
                        dense() ? "py-1.5 min-[1280px]:py-1" : "py-3",
                      )}
                      data-testid="mp-result-wpm"
                    >
                      {Math.round(r.wpm)}
                    </td>
                    <td
                      class={cn(
                        "hidden px-2 text-right sm:table-cell sm:px-3",
                        subCls(r.playerId),
                        dense() ? "py-1.5 min-[1280px]:py-1" : "py-3",
                      )}
                    >
                      {Math.round(r.raw)}
                    </td>
                    <td
                      class={cn(
                        "px-2 text-right text-text sm:px-3",
                        dense() ? "py-1.5 min-[1280px]:py-1" : "py-3",
                      )}
                    >
                      {r.acc.toFixed(1)}%
                    </td>
                    <td
                      class={cn(
                        "hidden px-3 text-right sm:table-cell",
                        dense() ? "py-1.5 min-[1280px]:py-1" : "py-3",
                      )}
                    >
                      <Show
                        when={r.flagged}
                        fallback={<span class={subCls(r.playerId)}>-</span>}
                      >
                        <span
                          class={errCls(r.playerId)}
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
        <Show when={resultsReadyOn()}>
          <div
            class="flex flex-wrap items-center gap-3"
            data-testid="mp-next-race"
          >
            <Show
              when={isHost()}
              fallback={
                <ReadyButton
                  ready={meReady()}
                  text="Ready for next race"
                  onToggle={setReady}
                />
              }
            >
              <Button
                text="start next race"
                fa={{ icon: "fa-flag-checkered" }}
                class={cn(PRIMARY_BUTTON, "px-6 py-3 text-lg")}
                disabled={!canStartRace(props.room, myId() ?? "", true)}
                dataset={{ "data-testid": "mp-start-next" }}
                onClick={() => startRace()}
              />
              <ReadyCount {...readyCount(props.room, true)} />
            </Show>
            <Button
              text="back to lobby"
              fa={{ icon: "fa-door-open" }}
              class="px-5 py-3"
              dataset={{ "data-testid": "mp-back-to-lobby" }}
              onClick={() => (isHost() ? rematch() : backToLobby())}
            />
            <Button
              text="leave"
              fa={{ icon: "fa-sign-out-alt" }}
              variant="text"
              class="px-3 py-3"
              dataset={{ "data-testid": "mp-leave" }}
              onClick={() => leaveRoom()}
            />
          </div>
          <Show when={isHost()}>
            <div class="text-sm text-sub" data-testid="mp-next-hint">
              players who go back to the lobby without readying sit the next
              race out
            </div>
          </Show>
        </Show>
        <Show when={!resultsReadyOn()}>
          <div class="flex flex-wrap items-center gap-3">
            <Show
              when={isHost()}
              fallback={
                <span class="text-sub" data-testid="mp-waiting-host">
                  <Fa icon="fa-hourglass-half" /> waiting for the host to start
                  a rematch
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
        </Show>
      </div>
    </div>
  );
}
