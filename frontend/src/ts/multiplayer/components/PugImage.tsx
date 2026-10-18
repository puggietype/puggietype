import { createResource, JSXElement } from "solid-js";

import {
  getPugImageUrl,
  normalizePugSvg,
} from "../../components/pages/test/pug-frames";
import { cn } from "../../utils/cn";

let nextId = 0;

async function loadSvg(file: string): Promise<string> {
  try {
    const response = await fetch(getPugImageUrl(file));
    if (!response.ok) return "";
    return normalizePugSvg(await response.text(), `pug-img-${nextId++}-`) ?? "";
  } catch {
    return "";
  }
}

/**
 * A pug frame by filename, inlined so theme colours apply. `file` must be one
 * of our static frame names, never user or network input.
 */
export function PugImage(props: {
  file: string;
  class?: string;
  testId?: string;
}): JSXElement {
  const [svg] = createResource(() => props.file, loadSvg);
  return (
    <div
      class={cn("text-(--pug-ink) [&>svg]:h-full [&>svg]:w-full", props.class)}
      data-testid={props.testId}
      aria-hidden="true"
      // oxlint-disable-next-line solid/no-innerhtml -- same-origin static svg, sanitised by normalizePugSvg
      innerHTML={svg() ?? ""}
    ></div>
  );
}
