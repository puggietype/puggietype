import { createResource, JSXElement } from "solid-js";

import {
  loadCharacterSvg,
  type Character,
  type CharacterImageFrame,
} from "../../components/pages/test/character-frames";
import { cn } from "../../utils/cn";

/**
 * One dog frame, inlined so theme colours apply (outline = --pug-ink).
 * Decorative unless `alt` is given.
 */
export function CharacterImage(props: {
  character: Character;
  frame: CharacterImageFrame;
  class?: string;
  testId?: string;
  alt?: string;
}): JSXElement {
  const [svg] = createResource(
    () => [props.character, props.frame] as const,
    async ([character, frame]) =>
      (await loadCharacterSvg(character, frame)) ?? "",
  );
  return (
    <div
      class={cn("text-(--pug-ink) [&>svg]:h-full [&>svg]:w-full", props.class)}
      data-testid={props.testId}
      data-character={props.character}
      role={props.alt !== undefined ? "img" : undefined}
      aria-label={props.alt}
      aria-hidden={props.alt === undefined ? "true" : undefined}
      // oxlint-disable-next-line solid/no-innerhtml -- same-origin static svg, sanitised by normalizePugSvg
      innerHTML={svg.latest ?? ""}
    ></div>
  );
}
