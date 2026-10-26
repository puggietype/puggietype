import {
  createEffect,
  createMemo,
  createResource,
  For,
  JSXElement,
  on,
  onCleanup,
  Show,
} from "solid-js";
import { createStore } from "solid-js/store";

import type { PlayerProgress, PlayerState } from "../protocol";

import {
  loadCharacterSvg,
  type Character,
} from "../../components/pages/test/character-frames";
import { cn } from "../../utils/cn";
import { prefersReducedMotion } from "../../utils/misc";
import {
  advanced,
  nextPaw,
  nextShake,
  opponentFrame,
  pawIntervalMs,
  TYPING_HOLD_MS,
  type OpponentFrame,
  type OpponentPaw,
  type ShakeState,
} from "../opponent-dog";
import { myId, opponentProgress, room } from "../store";
import { PlayerName } from "./PlayerName";
import { ordinal, PLAYER_TEXT } from "./ui";

const FRAMES: readonly OpponentFrame[] = [
  "idle",
  "left",
  "right",
  "winnerSmall",
];
/** at this many opponents the name tags go (the progress bars carry names) */
const DENSE_AT = 5;
const MAX_OPPONENTS = 7;

async function loadFrames(
  character: Character,
): Promise<Partial<Record<OpponentFrame, string>>> {
  const entries = await Promise.all(
    FRAMES.map(async (f) => [f, await loadCharacterSvg(character, f)] as const),
  );
  return Object.fromEntries(entries);
}

function OpponentDog(props: {
  player: PlayerState;
  progress: PlayerProgress | undefined;
  frame: OpponentFrame;
  place: number;
  dense: boolean;
}): JSXElement {
  const [frames] = createResource(() => props.player.character, loadFrames);
  const wpm = () => Math.round(props.progress?.wpm ?? 0);
  const finished = () => props.progress?.finished ?? props.player.finished;
  // smoothed per tick (not per frame); a number memo so an unchanged step
  // doesn't rewrite animation-duration
  const shake = createMemo<ShakeState | undefined>((prev) =>
    props.progress === undefined
      ? prev
      : nextShake(prev, props.progress.wpm, props.progress.testMs),
  );
  const shakeDuration = createMemo(() => shake()?.duration ?? 0);

  return (
    <div
      class={cn("grid w-20 justify-items-center gap-1 min-[1200px]:w-28", {
        "opacity-40": !props.player.connected,
      })}
      data-testid="mp-opponent-dog"
      data-player-id={props.player.id}
      data-character={props.player.character}
      data-frame={props.frame}
    >
      <div class="relative size-14 min-[1200px]:size-18">
        <div
          class="animate-shake absolute inset-0"
          style={{
            "animation-duration": `${prefersReducedMotion() ? 0 : shakeDuration()}s`,
          }}
        >
          <div class="absolute inset-0 text-(--pug-ink)">
            <For each={FRAMES}>
              {(name) => (
                <div
                  class={cn("absolute inset-0 [&>svg]:h-full [&>svg]:w-full", {
                    hidden: props.frame !== name,
                  })}
                  // oxlint-disable-next-line solid/no-innerhtml -- same-origin static svg, sanitised by normalizePugSvg
                  innerHTML={frames.latest?.[name] ?? ""}
                ></div>
              )}
            </For>
          </div>
        </div>
        <Show when={props.dense}>
          <span
            class={cn(
              "absolute -top-1 -left-1 grid size-5 place-items-center rounded-full bg-sub-alt text-xs leading-none font-(--font) font-bold",
              PLAYER_TEXT[props.player.color],
            )}
          >
            {props.player.color.slice(3)}
          </span>
        </Show>
      </div>
      <Show when={!props.dense}>
        <span
          class={cn(
            "w-full min-w-0 text-center text-xs leading-tight font-(--font)",
            PLAYER_TEXT[props.player.color],
          )}
        >
          <PlayerName player={props.player} truncate />
        </span>
      </Show>
      <span class="text-xs leading-none font-(--font) whitespace-nowrap text-sub">
        <Show
          when={props.player.connected}
          fallback={<span>reconnecting</span>}
        >
          {finished() ? ordinal(props.place) : `${wpm()} wpm`}
        </Show>
      </span>
    </div>
  );
}

/** rank by finish, then position (word, then char) */
function places(
  players: PlayerState[],
  progress: Map<string, PlayerProgress>,
): Map<string, number> {
  const key = (p: PlayerState) => {
    const pr = progress.get(p.id);
    return [
      pr?.finished === true || p.finished ? 1 : 0,
      pr?.wordIndex ?? 0,
      pr?.charIndex ?? 0,
    ];
  };
  const sorted = [...players].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      const d = (kb[i] ?? 0) - (ka[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  });
  return new Map(
    sorted.map((p, i) => {
      const rank = i + 1;
      return [p.id, p.place ?? rank];
    }),
  );
}

/**
 * Opponents' dogs above the progress bars, driven by race:progress: paws
 * alternate while their position moves (rate from wpm), idle when still,
 * winner-small when finished, dimmed while reconnecting. Decorative and
 * aria-hidden: the progress bars already announce each name and place, so
 * screen readers hear every opponent once. Hidden on phones (heads sit in the bars).
 */
export function OpponentDogs(): JSXElement {
  const opponents = createMemo(() =>
    (room()?.players ?? [])
      .filter((p) => p.id !== myId())
      .slice(0, MAX_OPPONENTS),
  );
  const progressById = createMemo(
    () => new Map(opponentProgress().map((p) => [p.id, p])),
  );
  const placeById = createMemo(() =>
    places(room()?.players ?? [], progressById()),
  );
  const reduced = prefersReducedMotion();

  // paw state lives outside solid; only the shown paw is reactive
  const [paws, setPaws] = createStore<Record<string, OpponentPaw>>({});
  const anim = new Map<
    string,
    { last?: PlayerProgress; typingUntil: number; nextAt: number }
  >();
  let raf: number | undefined;

  const step = (now: number): void => {
    raf = undefined;
    let busy = false;
    for (const p of opponents()) {
      const st = anim.get(p.id);
      const typing = st !== undefined && now < st.typingUntil;
      let paw = paws[p.id] ?? "idle";
      if (!typing) {
        paw = "idle";
      } else if (now >= st.nextAt) {
        paw = nextPaw(paw);
        st.nextAt = now + pawIntervalMs(progressById().get(p.id)?.wpm ?? 0);
      }
      if (paws[p.id] !== paw) setPaws(p.id, paw);
      busy ||= typing;
    }
    if (busy) raf = requestAnimationFrame(step);
  };

  createEffect(
    on(opponentProgress, (list) => {
      if (reduced) return;
      const now = performance.now();
      for (const p of list) {
        const st = anim.get(p.id) ?? { typingUntil: 0, nextAt: 0 };
        if (!p.finished && advanced(st.last, p)) {
          // starting to type: first paw after a random part of an interval,
          // so several dogs don't paddle in lockstep
          if (now >= st.typingUntil) {
            st.nextAt = now + Math.random() * pawIntervalMs(p.wpm);
          }
          st.typingUntil = now + TYPING_HOLD_MS;
        }
        st.last = p;
        anim.set(p.id, st);
      }
      raf ??= requestAnimationFrame(step);
    }),
  );
  onCleanup(() => {
    if (raf !== undefined) cancelAnimationFrame(raf);
  });

  const frameOf = (p: PlayerState): OpponentFrame =>
    opponentFrame({
      finished: progressById().get(p.id)?.finished ?? p.finished,
      connected: p.connected,
      typing: (paws[p.id] ?? "idle") !== "idle",
      paw: paws[p.id] ?? "idle",
      reducedMotion: reduced,
    });

  return (
    <Show when={opponents().length > 0}>
      <div
        class="flex flex-wrap justify-center gap-x-4 gap-y-2 max-[601px]:hidden"
        aria-hidden="true"
        data-testid="mp-opponent-dogs"
      >
        <For each={opponents()}>
          {(p) => (
            <div class="contents">
              <OpponentDog
                player={p}
                progress={progressById().get(p.id)}
                frame={frameOf(p)}
                place={placeById().get(p.id) ?? 1}
                dense={opponents().length >= DENSE_AT}
              />
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
