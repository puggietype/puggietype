import {
  createMemo,
  createResource,
  createSignal,
  For,
  JSXElement,
  onCleanup,
  onMount,
} from "solid-js";

import { getConfig } from "../../../config/store";
import { createEffectOn } from "../../../hooks/effects";
import { myCharacter } from "../../../multiplayer/store";
import { getMonkeyState } from "../../../states/monkey";
import { currentLiveStats, isTestActive } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { prefersReducedMotion } from "../../../utils/misc";
import { AnimeShow } from "../../common/anime";
import { type Character, loadCharacterSvg } from "./character-frames";
import {
  getHalfFrameMs,
  getPugHeat,
  getPugSpeed,
  getShakeState,
  isSteaming,
} from "./pug-fast";
import {
  getHandsFrame,
  getTransitionFrame,
  PUG_FRAME_FILES,
  PugFrame,
} from "./pug-frames";

const BLINK_MS = 140;

const frameNames = Object.keys(PUG_FRAME_FILES) as PugFrame[];

async function loadFrames(
  character: Character,
): Promise<Partial<Record<PugFrame, string>>> {
  const entries = await Promise.all(
    frameNames.map(
      async (name) => [name, await loadCharacterSvg(character, name)] as const,
    ),
  );
  return Object.fromEntries(entries);
}

export function Pug(): JSXElement {
  // fetched lazily the first time pug mode is shown, then cached; the dog is
  // the saved pick (solo) or our seat's (race), puggie with the flag off
  const [frames] = createResource(
    () => (getConfig.monkey ? myCharacter() : undefined),
    loadFrames,
  );

  const speed = () => getPugSpeed(currentLiveStats, getConfig.blindMode);
  const heat = () => getPugHeat(speed());
  // hysteresis keeps the shake from flickering on and off around 130 wpm
  let shakeActive = false;
  const shakeDuration = createMemo(() => {
    const next = getShakeState(shakeActive, speed());
    shakeActive = next.active;
    return next.duration;
  });

  const [frame, setFrame] = createSignal<PugFrame>("idle");
  let halfTimeout: ReturnType<typeof setTimeout> | undefined;

  createEffectOn(
    () => getHandsFrame(getMonkeyState()),
    (next, prev) => {
      clearTimeout(halfTimeout);
      const half = getTransitionFrame(prev ?? "idle", next);
      if (half === undefined || prefersReducedMotion()) {
        setFrame(next);
        return;
      }
      setFrame(half);
      halfTimeout = setTimeout(() => setFrame(next), getHalfFrameMs(heat()));
    },
  );

  // blink every 3-6s while the paws are up
  let blinkTimeout: ReturnType<typeof setTimeout> | undefined;
  const scheduleBlink = (): void => {
    blinkTimeout = setTimeout(
      () => {
        if (frame() === "idle") {
          setFrame("blink");
          setTimeout(() => {
            if (frame() === "blink") setFrame("idle");
          }, BLINK_MS);
        }
        scheduleBlink();
      },
      3000 + Math.random() * 3000,
    );
  };
  onMount(() => {
    if (!prefersReducedMotion()) scheduleBlink();
  });
  onCleanup(() => {
    clearTimeout(halfTimeout);
    clearTimeout(blinkTimeout);
  });

  return (
    <AnimeShow when={getConfig.monkey && isTestActive()}>
      <div
        class="animate-shake mx-auto flex h-0 w-fit justify-center"
        data-ui-element="pug-shake"
        style={{ "animation-duration": `${shakeDuration()}s` }}
      >
        <div
          class="pug-fast absolute h-50 w-50 text-(--pug-ink)"
          style={{ "--pug-heat": heat().toFixed(3) }}
          data-ui-element="pug"
          data-steaming={isSteaming(heat()) ? "" : undefined}
          data-frame={frame()}
          data-character={myCharacter()}
        >
          <div class="pug-fast-glow" aria-hidden="true"></div>
          <For each={frameNames}>
            {(name) => (
              <div
                class={cn("absolute inset-0 [&>svg]:h-full [&>svg]:w-full", {
                  hidden: frame() !== name,
                })}
                // oxlint-disable-next-line solid/no-innerhtml -- same-origin static svg, sanitised by normalizePugSvg
                innerHTML={frames.latest?.[name] ?? ""}
              ></div>
            )}
          </For>
          <div class="pug-steam" aria-hidden="true">
            <span>
              <svg viewBox="0 0 12 28">
                <path d="M6 27c-4-4 4-7 0-12s4-8 0-13"></path>
              </svg>
            </span>
            <span>
              <svg viewBox="0 0 12 28">
                <path d="M6 27c-4-4 4-7 0-12s4-8 0-13"></path>
              </svg>
            </span>
            <span>
              <svg viewBox="0 0 12 28">
                <path d="M6 27c-4-4 4-7 0-12s4-8 0-13"></path>
              </svg>
            </span>
          </div>
        </div>
      </div>
    </AnimeShow>
  );
}
