import { createResource, JSXElement } from "solid-js";

import {
  getPugImageUrl,
  normalizePugSvg,
  PUG_WINNER_FILE,
} from "../../components/pages/test/pug-frames";
import { cn } from "../../utils/cn";

async function loadWinner(): Promise<string> {
  try {
    const response = await fetch(getPugImageUrl(PUG_WINNER_FILE));
    if (!response.ok) return "";
    return normalizePugSvg(await response.text(), "pug-winner-") ?? "";
  } catch {
    return "";
  }
}

/** the pug-winner frame, inlined so theme colours apply */
export function PugWinner(props: { class?: string }): JSXElement {
  const [svg] = createResource(loadWinner);
  return (
    <div
      class={cn("text-(--pug-ink) [&>svg]:h-full [&>svg]:w-full", props.class)}
      data-testid="mp-pug-winner"
      // oxlint-disable-next-line solid/no-innerhtml -- same-origin static svg, sanitised by normalizePugSvg
      innerHTML={svg() ?? ""}
    ></div>
  );
}
