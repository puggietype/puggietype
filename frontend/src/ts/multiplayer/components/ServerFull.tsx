import { createSignal, JSXElement, onCleanup, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import { PugHead } from "../../components/common/PugHead";
import { cn } from "../../utils/cn";
import { FULL_TEXT, secondsLeft, type FullState } from "../capacity";
import { PRIMARY_BUTTON } from "./ui";

/** the server is at capacity: countdown to the auto-retry, try now, go solo */
export function ServerFull(props: {
  state: FullState;
  onRetry: () => void;
}): JSXElement {
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), 250);
  onCleanup(() => clearInterval(timer));

  return (
    <section
      class="mx-auto grid w-full max-w-xl justify-items-center gap-4 rounded-lg bg-sub-alt p-8 text-center"
      data-testid="mp-full"
      data-scope={props.state.scope}
      aria-labelledby="mpFullTitle"
    >
      <PugHead class="h-20 w-20" />
      <div role="status" class="grid gap-2">
        <h2 id="mpFullTitle" class="text-2xl text-text">
          {FULL_TEXT.title} <span aria-hidden="true">🐶</span>
        </h2>
        <p class="text-sub">{FULL_TEXT.body}</p>
        <Show when={props.state.retrying}>
          <p class="text-sm text-sub" data-testid="mp-full-retrying">
            {FULL_TEXT.retrying}
          </p>
        </Show>
      </div>
      <div
        class={cn("text-2xl font-(--font) text-main", {
          invisible: props.state.retrying,
        })}
        role="timer"
        data-testid="mp-full-countdown"
      >
        {FULL_TEXT.retryingIn(secondsLeft(props.state.retryAt, now()))}
      </div>
      <div class="flex flex-wrap justify-center gap-3">
        <Button
          text={FULL_TEXT.tryNow}
          fa={{ icon: "fa-redo" }}
          class={cn(PRIMARY_BUTTON, "px-5 py-3")}
          disabled={props.state.retrying}
          dataset={{ "data-testid": "mp-full-retry" }}
          onClick={() => props.onRetry()}
        />
        <Button
          text={FULL_TEXT.solo}
          fa={{ icon: "fa-keyboard" }}
          class="px-5 py-3"
          router-link
          href="/"
          dataset={{ "data-testid": "mp-full-solo" }}
        />
      </div>
    </section>
  );
}
