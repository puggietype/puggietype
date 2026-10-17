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
        class={cn("h-full w-auto shrink-0 text-main transition-colors", {
          "text-sub": getFocus(),
        })}
      />
      <div class="hidden h-6 place-content-center text-[2rem] leading-0 sm:grid">
        <div
          class={cn(
            "-mt-[1.65em] hidden pl-[0.5em] text-[0.315em] leading-0 text-sub transition-colors duration-125 lg:block",
            {
              "text-transparent": getFocus(),
            },
          )}
          data-ui-element="logoSubtext"
        >
          {isDevEnvironment() ? "localhost" : "type fast. stay cute."}
        </div>
        <h1
          class={cn("-mt-[0.11em] text-text transition-colors duration-250", {
            "text-sub": getFocus(),
          })}
          data-ui-element="logoText"
        >
          puggietype
        </h1>
      </div>
    </a>
  );
}
