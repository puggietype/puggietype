import { createSignal, JSXElement, onCleanup } from "solid-js";

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
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), 250);
  onCleanup(() => clearInterval(timer));

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
