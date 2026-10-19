import { createSignal, JSXElement, onCleanup, onMount } from "solid-js";

import { Button } from "../../components/common/Button";
import { PugHead } from "../../components/common/PugHead";
import { BOT_BADGE, BOT_LABEL } from "../bots";
import {
  queueBandText,
  queueElapsedText,
  type QueueState,
} from "../quick-match";

/** waiting for a Quick Match: pug, pace band, elapsed time, cancel */
export function QuickMatchQueue(props: {
  state: QueueState;
  onCancel: () => void;
}): JSXElement {
  // tick just after each whole second of the wait (not on a free-running 250ms
  // interval), so every second shows for a full second
  const [now, setNow] = createSignal(Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    const t = Date.now();
    setNow(t);
    const elapsed = t - props.state.since;
    const wait = 1000 - (((elapsed % 1000) + 1000) % 1000) + 5;
    timer = setTimeout(schedule, wait);
  };
  onMount(schedule);
  onCleanup(() => clearTimeout(timer));

  return (
    <section
      class="mx-auto grid w-full max-w-xl justify-items-center gap-4 rounded-lg bg-sub-alt p-8 text-center"
      data-testid="mp-queue"
      aria-labelledby="mpQueueTitle"
    >
      <PugHead class="h-20 w-20 motion-safe:animate-pulse" />
      <h2 id="mpQueueTitle" class="text-2xl text-text">
        finding a match...
      </h2>
      <div
        class="font-(--font) text-sub"
        aria-live="polite"
        data-testid="mp-queue-band"
      >
        {queueBandText(props.state)}
      </div>
      <div
        class="text-4xl font-(--font) text-main"
        role="timer"
        aria-label="time in queue"
        data-testid="mp-queue-elapsed"
      >
        {queueElapsedText(props.state.since, now())}
      </div>
      <div class="text-sm text-sub">
        time 30 · english · if nobody is around, bots marked {BOT_BADGE}{" "}
        {BOT_LABEL} fill the race
      </div>
      <Button
        text="cancel"
        fa={{ icon: "fa-times" }}
        class="px-5 py-3"
        dataset={{ "data-testid": "mp-queue-cancel" }}
        onClick={() => props.onCancel()}
      />
    </section>
  );
}
