import { JSXElement, Show } from "solid-js";

import { getActivePage } from "../../../states/core";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";

/**
 * Adopts the crawlable intro from index.html (html/site-intro.html). App
 * renders it between the page and the footer; the test page fills the first
 * screen (App.tsx), so the intro starts below the fold and can't shift the
 * test. Test page only, and fades out with the footer while typing.
 */
export function SiteIntro(): JSXElement {
  const intro = document.getElementById("siteIntro");
  intro?.classList.remove("preload");

  return (
    <Show when={intro}>
      {(el) => (
        <div
          class={cn("transition-opacity", {
            hidden: getActivePage() !== "test",
            "opacity-0": getFocus(),
          })}
          data-ui-element="siteIntro"
        >
          {el()}
        </div>
      )}
    </Show>
  );
}
