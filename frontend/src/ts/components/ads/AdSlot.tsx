import {
  createEffect,
  JSXElement,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";

import type { AdSlotKind } from "../../ads/provider";

import { getAdProvider } from "../../ads/provider";
import { getAdSlotSpec } from "../../ads/slots";
import {
  isAdsActive,
  isAdsReady,
  isAdsSuppressed,
  prepareAds,
} from "../../ads/state";
import { getIsScreenshotting } from "../../states/core";
import { cn } from "../../utils/cn";

// literal classes (tailwind scans for them): the reserved box per unit size
const BOX_CLASS: Record<string, string> = {
  "728x90": "h-[90px] w-[728px]",
  "320x100": "h-[100px] w-[320px]",
  "160x600": "h-[600px] w-[160px]",
};

/**
 * One labelled ad slot with a fixed reserved size (no layout shift). Renders
 * nothing unless ads are active. Requests one ad per mount, so a new ad needs
 * a new results or page view: never refreshed. Hidden while a test or race
 * runs (the `adsSuppressed` class also hides it synchronously).
 */
export function AdSlot(props: {
  kind: AdSlotKind;
  class?: string;
  /** may show the consent message (false on the test page) */
  consentUi?: boolean;
  /** called once the slot was filled, or found it can't be */
  onState?: (state: "filled" | "unavailable") => void;
}): JSXElement {
  return (
    <Show when={isAdsActive()}>
      <AdSlotInner {...props} />
    </Show>
  );
}

function AdSlotInner(props: {
  kind: AdSlotKind;
  class?: string;
  consentUi?: boolean;
  onState?: (state: "filled" | "unavailable") => void;
}): JSXElement {
  // kind and size are fixed for the life of the slot
  const spec = untrack(() => getAdSlotSpec(props.kind, window.innerWidth));
  const consentUi = untrack(() => props.consentUi ?? true);
  const report = (state: "filled" | "unavailable"): void => {
    untrack(() => props.onState?.(state));
  };
  let boxRef: HTMLDivElement | undefined;
  let requested = false;
  let disposed = false;
  let filled = false;

  const fill = (): void => {
    if (requested || isAdsSuppressed()) return;
    requested = true;
    void prepareAds({ consentUi }).then((ok) => {
      if (disposed || boxRef === undefined) return;
      if (!ok || isAdsSuppressed()) {
        // try again on the next unsuppressed moment of this view
        requested = false;
        if (!ok) report("unavailable");
        return;
      }
      getAdProvider().render(boxRef, spec);
      filled = true;
      report("filled");
    });
  };

  onMount(() => {
    // a slot mounted during a test waits for it to end
    // and a rail retries once a results page got ads ready
    createEffect(() => {
      const suppressed = isAdsSuppressed();
      isAdsReady();
      if (!suppressed && !filled) fill();
    });
  });

  onCleanup(() => {
    disposed = true;
    if (boxRef !== undefined) getAdProvider().destroy(boxRef);
  });

  return (
    <aside
      class={cn("ptAd", `ptAd-${props.kind}`, props.class, {
        hidden: isAdsSuppressed() || getIsScreenshotting(),
      })}
      aria-label="Advertisement"
      data-ad-kind={props.kind}
    >
      <div class="ptAdLabel">Advertisement</div>
      <div
        ref={(el) => (boxRef = el)}
        class={cn("ptAdBox", BOX_CLASS[`${spec.width}x${spec.height}`])}
      ></div>
    </aside>
  );
}
