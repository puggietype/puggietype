import { For, JSXElement, Show } from "solid-js";

import { Fa } from "../../components/common/Fa";
import { cn } from "../../utils/cn";
import { myId, opponentProgress, race, room } from "../store";
import { PLAYER_BG, PLAYER_TEXT } from "./ui";

/** extra words of headroom in time mode, where the end isn't known */
const TIME_MODE_HEADROOM = 10;

/** compact per-player progress bars, fed by race:progress */
export function RaceProgressBars(props: { class?: string }): JSXElement {
  const rows = () => {
    const r = room();
    const info = race();
    if (r === undefined || info === undefined) return [];
    const progress = new Map(opponentProgress().map((p) => [p.id, p]));
    const position = (id: string): number => {
      const p = progress.get(id);
      if (p === undefined) return 0;
      const word = info.words[p.wordIndex] ?? "";
      const partial = word.length > 0 ? p.charIndex / word.length : 0;
      return p.wordIndex + Math.min(1, partial);
    };
    const total =
      info.settings.mode === "words"
        ? info.words.length
        : Math.max(...r.players.map((p) => position(p.id))) +
          TIME_MODE_HEADROOM;
    return r.players.map((p) => {
      const pr = progress.get(p.id);
      const finished = pr?.finished ?? p.finished;
      return {
        player: p,
        fraction:
          finished && info.settings.mode === "words"
            ? 1
            : Math.min(1, position(p.id) / Math.max(1, total)),
        wpm: Math.round(pr?.wpm ?? 0),
        finished,
      };
    });
  };

  return (
    <div
      class={cn("grid gap-2 rounded-lg bg-sub-alt px-5 py-4", props.class)}
      data-testid="mp-progress"
    >
      <For each={rows()}>
        {(row) => (
          <div
            class="grid grid-cols-[8rem_1fr_3rem] items-center gap-4 text-sm font-(--font)"
            data-testid="mp-progress-row"
            data-player-id={row.player.id}
          >
            <span
              class={cn("truncate", PLAYER_TEXT[row.player.color], {
                "opacity-50": !row.player.connected,
              })}
            >
              {row.player.name}
              {row.player.id === myId() ? " (you)" : ""}
            </span>
            <div class="h-1.5 rounded-full bg-bg">
              <div
                class={cn(
                  "h-full rounded-full transition-[width] duration-200 ease-linear",
                  PLAYER_BG[row.player.color],
                )}
                style={{ width: `${(row.fraction * 100).toFixed(1)}%` }}
              ></div>
            </div>
            <span
              class={cn("text-right", PLAYER_TEXT[row.player.color])}
              title={row.finished ? "finished" : "wpm"}
            >
              <Show when={row.finished} fallback={row.wpm}>
                <Fa icon="fa-check" />
              </Show>
            </span>
          </div>
        )}
      </For>
    </div>
  );
}
