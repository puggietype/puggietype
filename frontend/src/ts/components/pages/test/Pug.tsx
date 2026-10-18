import { mapRange } from "@monkeytype/util/numbers";
import {
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
  getHandsFrame,
  getTransitionFrame,
  PUG_FRAME_FILES,
  PugFrame,
} from "./pug-frames";

const MIN_WPM = 130;
const MAX_WPM = 180;
const HALF_FRAME_MS = 45;
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

  const speed = () =>
    (getConfig.blindMode ? currentLiveStats.raw : currentLiveStats.wpm) ?? 0;

  const shakeDuration = () => {
    const duration = mapRange(speed(), MIN_WPM, MAX_WPM, 0.25, 0.01);
    return duration === 0.25 ? 0 : duration;
  };

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
      halfTimeout = setTimeout(() => setFrame(next), HALF_FRAME_MS);
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
        style={{ "animation-duration": `${shakeDuration()}s` }}
      >
        <div
          class="absolute h-50 w-50 text-(--pug-ink)"
          data-ui-element="pug"
          data-frame={frame()}
          data-character={myCharacter()}
        >
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
        </div>
      </div>
    </AnimeShow>
  );
}
