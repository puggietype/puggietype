import { JSXElement } from "solid-js";

import { restartTestEvent } from "../../../events/test";
import { getActivePage } from "../../../states/core";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { isDevEnvironment } from "../../../utils/env";
import { PugHead } from "../../common/PugHead";

export function Logo(): JSXElement {
  return (
    <a
      href={`${location.origin}/`}
      class="-m-2 flex h-6 w-max gap-2 rounded-[0.8rem] p-2 focus-visible:**:data-[ui-element='logoSubtext']:text-transparent"
      aria-label="puggietype home"
      router-link
      style={{
        "box-sizing": "content-box",
        "font-family": "Lexend, sans-serif",
        "font-weight": 600,
      }}
      data-ui-element="logo"
      onClick={() => {
        if (getActivePage() === "test") restartTestEvent.dispatch();
      }}
    >
      <PugHead
        class={cn("h-full w-auto shrink-0 transition-opacity", {
          "opacity-50": getFocus(),
        })}
      />
      {/* tagline sits in normal flow above the wordmark (no negative offsets
          tuned to one font), so it can never overlap the glyphs */}
      <div class="hidden h-6 flex-col justify-center sm:flex">
        <div
          class={cn(
            "mb-[0.2rem] hidden pl-[0.15em] text-[0.62rem] leading-none whitespace-nowrap text-sub transition-colors duration-125 lg:block",
            {
              "text-transparent": getFocus(),
            },
          )}
          data-ui-element="logoSubtext"
        >
          {isDevEnvironment() ? "localhost" : "type fast. stay cute."}
        </div>
        <h1
          class={cn(
            "text-[2rem] leading-[0.75] text-text transition-colors duration-250",
            {
              "text-sub": getFocus(),
            },
          )}
          data-ui-element="logoText"
        >
          puggietype
        </h1>
      </div>
    </a>
  );
}
