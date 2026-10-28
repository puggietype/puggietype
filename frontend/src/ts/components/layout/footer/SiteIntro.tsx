import { JSXElement, Show } from "solid-js";

import { getActivePage } from "../../../states/core";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";

/**
 * Adopts the crawlable intro from index.html (html/site-intro.html). Rendered
 * after #app, so it sits below the footer and #app's 100vh: it can't shift the
 * test. Test page only, and fades out with the footer while typing.
 */
export function SiteIntro(): JSXElement {
  const intro = document.getElementById("siteIntro");
  intro?.classList.remove("preload");

  return (
    <Show when={intro}>
      {(el) => (
        <div
          class={cn("content-grid transition-opacity", {
            hidden: getActivePage() !== "test",
            "opacity-0": getFocus(),
          })}
        >
          {el()}
        </div>
      )}
    </Show>
  );
}
