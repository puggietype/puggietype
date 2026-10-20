import {
  createComputed,
  createEffect,
  createSignal,
  JSXElement,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

import { AD_CLEARANCE_SELECTOR, minClearance } from "../../ads/clearance";
import {
  AD_CLEARANCE_PX,
  RAILS_MIN_HEIGHT,
  RAILS_MIN_WIDTH,
} from "../../ads/slots";
import { isAdsActive, isAdsSuppressed } from "../../ads/state";
import { getActivePage } from "../../states/core";
import { cn } from "../../utils/cn";
import { AdSlot } from "./AdSlot";

const RAILS_QUERY = `(min-width: ${RAILS_MIN_WIDTH}px) and (min-height: ${RAILS_MIN_HEIGHT}px)`;

/** class on <html> that narrows #app so the rails keep their distance */
export const ADS_LAYOUT_CLASS = "adsLayout";

/**
 * 160x600 rails left and right of the test page, only from 1600px wide.
 * The `adsLayout` class pads #app so the rails sit 150px+ away from
 * everything; a measured check hides them if anything still comes closer.
 * Hidden during tests and races; never load the consent message.
 */
export function AdRails(): JSXElement {
  return (
    <Show when={isAdsActive()}>
      <AdRailsInner />
    </Show>
  );
}

function AdRailsInner(): JSXElement {
  const media = window.matchMedia(RAILS_QUERY);
  const [isWide, setWide] = createSignal(media.matches);
  const onMedia = (): void => {
    setWide(media.matches);
  };
  media.addEventListener("change", onMedia);
  onCleanup(() => media.removeEventListener("change", onMedia));

  createComputed(() => {
    document.documentElement.classList.toggle(ADS_LAYOUT_CLASS, isAdsActive());
  });
  onCleanup(() => document.documentElement.classList.remove(ADS_LAYOUT_CLASS));

  return (
    <Show when={isWide() && getActivePage() === "test"}>
      <Rails />
    </Show>
  );
}

function Rails(): JSXElement {
  const [filled, setFilled] = createSignal(0);
  const [isClear, setClear] = createSignal(false);
  const check = (): void => {
    if (isAdsSuppressed()) return;
    const rails = [...document.querySelectorAll(".ptAd-rail")];
    const others = [...document.querySelectorAll(AD_CLEARANCE_SELECTOR)]
      .filter((el) => el.closest(".ptAd") === null)
      .map((el) => el.getBoundingClientRect());
    setClear(
      rails.length > 0 &&
        rails.every(
          (rail) =>
            minClearance(rail.getBoundingClientRect(), others) >=
            AD_CLEARANCE_PX,
        ),
    );
  };

  onMount(() => {
    const main = document.querySelector("main");
    const observer = new ResizeObserver(check);
    if (main !== null) observer.observe(main);
    window.addEventListener("resize", check);
    // results or idle again: the layout changed while the rails were hidden
    createEffect(
      on(isAdsSuppressed, (suppressed) => {
        if (!suppressed) requestAnimationFrame(check);
      }),
    );
    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener("resize", check);
    });
  });

  const onState = (state: "filled" | "unavailable"): void => {
    if (state === "filled") {
      setFilled((n) => n + 1);
      check();
    }
  };

  const railClass = (): string => cn({ invisible: filled() < 2 || !isClear() });

  return (
    <>
      <AdSlot
        kind="rail"
        consentUi={false}
        class={cn("ptAdRailLeft", railClass())}
        onState={onState}
      />
      <AdSlot
        kind="rail"
        consentUi={false}
        class={cn("ptAdRailRight", railClass())}
        onState={onState}
      />
    </>
  );
}
