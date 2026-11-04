import { createSignal, JSXElement, onCleanup, onMount, Show } from "solid-js";

import { cn } from "../../utils/cn";
import { accountsCopy } from "../strings";
import {
  loadTurnstile,
  TurnstileApi,
  TurnstileRenderOptions,
} from "../turnstile";

export type TurnstileControl = { reset: () => void };

/**
 * Cloudflare Turnstile, script loaded on mount only. Reports a token, or null
 * when it expires, errors or is reset (tokens are single use).
 */
export function TurnstileWidget(props: {
  siteKey: string;
  action: string;
  onToken: (token: string | null) => void;
  control?: (control: TurnstileControl) => void;
}): JSXElement {
  let containerRef: HTMLDivElement | undefined;
  let api: TurnstileApi | undefined;
  let widgetId: string | undefined;
  let disposed = false;
  const [problem, setProblem] = createSignal<"unconfigured" | "failed" | null>(
    null,
  );

  onMount(() => {
    props.control?.({
      reset: () => {
        props.onToken(null);
        if (api !== undefined && widgetId !== undefined) api.reset(widgetId);
      },
    });
    if (props.siteKey === "") {
      setProblem("unconfigured");
      return;
    }
    const onToken = (token: string | null): void => props.onToken(token);
    const options: TurnstileRenderOptions = {
      sitekey: props.siteKey,
      action: props.action,
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
    };
    loadTurnstile()
      .then((loaded) => {
        if (disposed || containerRef === undefined) return;
        api = loaded;
        widgetId = loaded.render(containerRef, options);
      })
      .catch(() => setProblem("failed"));
  });

  onCleanup(() => {
    disposed = true;
    if (api !== undefined && widgetId !== undefined) api.remove(widgetId);
  });

  return (
    <>
      <div
        ref={(el) => (containerRef = el)}
        class={cn("min-h-16.25", { hidden: problem() !== null })}
      ></div>
      <Show when={problem() === "unconfigured"}>
        <p class="text-sm text-sub">{accountsCopy.turnstile.unconfigured}</p>
      </Show>
      <Show when={problem() === "failed"}>
        <p class="text-sm text-error">{accountsCopy.turnstile.failed}</p>
      </Show>
    </>
  );
}
