import { createMemo, For, JSXElement, Show } from "solid-js";

import { Fa } from "../../components/common/Fa";
import { cn } from "../../utils/cn";
import { myId, opponentProgress, race, room } from "../store";
import { PLAYER_BG, PLAYER_TEXT } from "./ui";

/** extra words of headroom in time mode, where the end isn't known */
const TIME_MODE_HEADROOM = 10;

/** compact per-player progress bars, fed by race:progress */
export function RaceProgressBars(props: { class?: string }): JSXElement {
  const progressById = createMemo(
    () => new Map(opponentProgress().map((p) => [p.id, p])),
  );

  /** words done, fractional for the current word */
  const position = (id: string): number => {
    const p = progressById().get(id);
    const words = race()?.words ?? [];
    if (p === undefined) return 0;
    const word = words[p.wordIndex] ?? "";
    const partial = word.length > 0 ? p.charIndex / word.length : 0;
    return p.wordIndex + Math.min(1, partial);
  };

  const total = createMemo(() => {
    const info = race();
    if (info === undefined) return 1;
    if (info.settings.mode === "words") return info.words.length;
    const leader = Math.max(
      0,
      ...(room()?.players ?? []).map((p) => position(p.id)),
    );
    return leader + TIME_MODE_HEADROOM;
  });

  const finished = (id: string): boolean =>
    progressById().get(id)?.finished ??
    room()?.players.find((p) => p.id === id)?.finished ??
    false;

  const fraction = (id: string): number =>
    finished(id) && race()?.settings.mode === "words"
      ? 1
      : Math.min(1, position(id) / Math.max(1, total()));

  return (
    <div
      class={cn(
        "grid rounded-lg bg-sub-alt",
        (room()?.players.length ?? 0) > 4
          ? "gap-x-8 gap-y-1.5 px-4 py-3 md:grid-cols-2"
          : "gap-2 px-5 py-4",
        props.class,
      )}
      data-testid="mp-progress"
    >
      <For each={room()?.players ?? []}>
        {(player) => (
          <div
            class="grid min-w-0 grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-sm font-(--font)"
            data-testid="mp-progress-row"
            data-player-id={player.id}
          >
            <span
              class={cn("truncate", PLAYER_TEXT[player.color], {
                "opacity-50": !player.connected,
              })}
            >
              {player.name}
              {player.id === myId() ? " (you)" : ""}
            </span>
            <div class="h-1.5 rounded-full bg-bg">
              <div
                class={cn(
                  "h-full rounded-full transition-[width] duration-200 ease-linear",
                  PLAYER_BG[player.color],
                )}
                style={{ width: `${(fraction(player.id) * 100).toFixed(1)}%` }}
              ></div>
            </div>
            <span
              class={cn("text-right", PLAYER_TEXT[player.color])}
              title={finished(player.id) ? "finished" : "wpm"}
            >
              <Show
                when={finished(player.id)}
                fallback={Math.round(progressById().get(player.id)?.wpm ?? 0)}
              >
                <Fa icon="fa-check" />
              </Show>
            </span>
          </div>
        )}
      </For>
    </div>
  );
}
