import { JSXElement } from "solid-js";

import { Button } from "../../components/common/Button";
import { PugHead } from "../../components/common/PugHead";
import { cn } from "../../utils/cn";
import { confirmAge } from "../age-gate";
import { PRIMARY_BUTTON } from "./ui";

/** shown before any multiplayer connection until the user confirms 13+ */
export function AgeGate(): JSXElement {
  return (
    <section
      class="mx-auto grid max-w-xl justify-items-center gap-4 rounded-lg bg-sub-alt p-8 text-center"
      data-testid="mp-age-gate"
      aria-labelledby="mpAgeGateTitle"
    >
      <PugHead class="h-16 w-16" />
      <h2 id="mpAgeGateTitle" class="text-2xl text-text">
        You must be 13 or older to play multiplayer
      </h2>
      <div class="text-sub">
        multiplayer races are with other people. by continuing you confirm you
        are 13 or older and agree to the{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener"
          class="text-main hover:text-text"
        >
          terms
        </a>
        .
      </div>
      <div class="flex flex-wrap justify-center gap-3">
        <Button
          text="I'm 13 or older"
          fa={{ icon: "fa-check" }}
          class={cn(PRIMARY_BUTTON, "px-5 py-3")}
          dataset={{ "data-testid": "mp-age-confirm" }}
          onClick={() => confirmAge()}
        />
        <Button
          text="go back"
          fa={{ icon: "fa-arrow-left" }}
          class="px-5 py-3"
          router-link
          href="/"
          dataset={{ "data-testid": "mp-age-back" }}
        />
      </div>
    </section>
  );
}
