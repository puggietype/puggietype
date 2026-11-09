import {
  createEffect,
  createSignal,
  JSXElement,
  onCleanup,
  Show,
} from "solid-js";

import {
  CONSENT_ESSENTIAL_COPY,
  type ConsentRecord,
  cssZoom,
  globalPrivacyControl,
  pinToVisualBottom,
  visibleViewportHeight,
} from "../../analytics/consent";
import { getAcceptedCookies, setAcceptedCookies } from "../../cookies";
import { hideModal, isModalOpen } from "../../states/modals";
import { cn } from "../../utils/cn";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";
import { H3 } from "../common/Headers";

const TITLE_ID = "consent-title";
const COPY_ID = "consent-copy";

function draftFrom(stored: ConsentRecord | null): ConsentRecord {
  const base: ConsentRecord = stored ?? {
    security: true,
    analytics: false,
    doNotSellOrShare: false,
  };
  if (globalPrivacyControl()) return { ...base, doNotSellOrShare: true };
  return base;
}

function clearBannerShift(): void {
  for (const selector of ["#pageTest", "#pageRace"]) {
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement)) continue;
    el.style.transform = "";
    el.style.maxHeight = "";
    el.style.overflowY = "";
    el.style.scrollPaddingBottom = "";
  }
  const dialog = document.getElementById("CookiesModal");
  if (dialog instanceof HTMLElement) {
    dialog.style.maxHeight = "";
    dialog.style.overflowY = "";
    dialog.style.bottom = "";
    const panel = dialog.querySelector(":scope > .modal");
    if (panel instanceof HTMLElement) {
      panel.style.maxHeight = "";
      panel.style.overflowY = "";
    }
  }
  document.documentElement.style.removeProperty("--consent-banner-block");
}

/**
 * Slide the test up into the gap under the header when the bar would cover
 * the word window. The word list itself is not clipped. The race page is a
 * scrollport that ends at the bar, so Create, Start and the lobby can scroll
 * into the clear area instead of sitting under the choices.
 */
function fitConsentBanner(): void {
  const dialog = document.getElementById("CookiesModal");
  const page =
    document.querySelector("#pageTest") ?? document.querySelector("#pageRace");
  if (!(dialog instanceof HTMLElement) || !(page instanceof HTMLElement)) {
    return;
  }
  page.style.transform = "";
  page.style.maxHeight = "";
  page.style.overflowY = "";
  const panel = dialog.querySelector(":scope > .modal");
  const limit = visibleViewportHeight();
  dialog.style.maxHeight = `${limit}px`;
  dialog.style.overflowY = "auto";
  pinToVisualBottom(dialog);
  if (panel instanceof HTMLElement) {
    panel.style.maxHeight = `${limit}px`;
    panel.style.overflowY = "auto";
  }
  const bar = dialog.getBoundingClientRect();
  if (bar.height <= 0) {
    return;
  }
  const cover =
    panel instanceof HTMLElement ? panel.getBoundingClientRect() : bar;
  document.documentElement.style.setProperty(
    "--consent-banner-block",
    `${Math.ceil(Math.min(bar.height, limit))}px`,
  );
  if (page.id === "pageRace") {
    const laneTop = reserveRaceLane(
      page,
      dialog,
      panel instanceof HTMLElement ? panel : null,
    );
    fitRaceScrollport(page, laneTop);
    return;
  }
  let overlap = 0;
  const words = document.querySelector("#wordsWrapper");
  if (words instanceof HTMLElement) {
    const rect = words.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > cover.top &&
      rect.top < cover.bottom
    ) {
      overlap = rect.bottom - cover.top;
    }
  }
  const header = document.querySelector("header");
  const headerBottom =
    header instanceof HTMLElement ? header.getBoundingClientRect().bottom : 0;
  const maxShift = Math.max(
    0,
    page.getBoundingClientRect().top - headerBottom - 4,
  );
  const zoom = cssZoom();
  const shift = Math.min(
    Math.ceil((overlap + 8) / zoom),
    Math.floor(maxShift / zoom),
  );
  page.style.transform = shift > 0 ? `translateY(-${shift}px)` : "";
}

/** Leave a lane tall enough for a race control; the bar scrolls inside itself. */
function reserveRaceLane(
  page: HTMLElement,
  dialog: HTMLElement,
  panel: HTMLElement | null,
): number {
  const zoom = cssZoom();
  const minLane = 120 * zoom;
  const pageTop = page.getBoundingClientRect().top;
  const coverOf = (): DOMRect => (panel ?? dialog).getBoundingClientRect();
  if (coverOf().top >= pageTop + minLane) {
    return coverOf().top;
  }
  const nextHeight = Math.max(
    72,
    Math.floor((window.innerHeight - pageTop - minLane) / zoom),
  );
  dialog.style.maxHeight = `${nextHeight}px`;
  if (panel !== null) {
    panel.style.maxHeight = `${nextHeight}px`;
  }
  return coverOf().top;
}

function fitRaceScrollport(page: HTMLElement, coverTop: number): void {
  const zoom = cssZoom();
  const header = document.querySelector("header");
  const headerBottom =
    header instanceof HTMLElement ? header.getBoundingClientRect().bottom : 0;
  const gap = Math.max(
    0,
    (page.getBoundingClientRect().top - headerBottom - 4) / zoom,
  );
  page.style.transform = gap > 0 ? `translateY(-${Math.floor(gap)}px)` : "";
  const room = Math.floor(
    (coverTop - page.getBoundingClientRect().top - 4) / zoom,
  );
  if (room <= 0) {
    return;
  }
  page.style.maxHeight = `${room}px`;
  page.style.overflowY = "auto";
  page.style.scrollPaddingBottom = "0.5rem";
}

export function CookiesModal(): JSXElement {
  const [showSettings, setShowSettings] = createSignal(false);
  const [accepted, setAccepted] = createSignal<ConsentRecord>(
    draftFrom(getAcceptedCookies()),
  );
  let restoreFocus: HTMLElement | undefined;

  createEffect(() => {
    const open = isModalOpen("Cookies");
    const stored = getAcceptedCookies();
    document.body.toggleAttribute("data-consent-banner", open);
    if (!open) {
      setShowSettings(false);
      setAccepted(draftFrom(stored));
      clearBannerShift();
      return;
    }
    showSettings();
    const dialog = document.getElementById("CookiesModal");
    const onFocusIn = (event: FocusEvent): void => {
      const from = event.relatedTarget;
      if (
        dialog !== null &&
        from instanceof HTMLElement &&
        !dialog.contains(from)
      ) {
        restoreFocus = from;
      }
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      save({
        security: true,
        analytics: false,
        doNotSellOrShare: true,
      });
    };
    const words = document.querySelector("#words");
    const race = document.querySelector("#pageRace");
    const onLayout = new MutationObserver(() => fitConsentBanner());
    const onBox = new ResizeObserver(() => fitConsentBanner());
    if (words !== null) {
      onLayout.observe(words, { childList: true });
    }
    if (race !== null) {
      onLayout.observe(race, { childList: true, subtree: true });
      onBox.observe(race);
    }
    if (dialog !== null) {
      onBox.observe(dialog);
    }
    document.fonts?.addEventListener("loadingdone", fitConsentBanner);
    dialog?.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onEscape, true);
    window.addEventListener("resize", fitConsentBanner);
    window.visualViewport?.addEventListener("resize", fitConsentBanner);
    window.visualViewport?.addEventListener("scroll", fitConsentBanner);
    void document.fonts?.ready.then(() => fitConsentBanner());
    requestAnimationFrame(fitConsentBanner);
    onCleanup(() => {
      onLayout.disconnect();
      onBox.disconnect();
      document.fonts?.removeEventListener("loadingdone", fitConsentBanner);
      dialog?.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onEscape, true);
      window.removeEventListener("resize", fitConsentBanner);
      window.visualViewport?.removeEventListener("resize", fitConsentBanner);
      window.visualViewport?.removeEventListener("scroll", fitConsentBanner);
      document.body.removeAttribute("data-consent-banner");
      clearBannerShift();
    });
  });

  const save = (record: ConsentRecord): void => {
    const next = globalPrivacyControl()
      ? { ...record, doNotSellOrShare: true }
      : record;
    setAccepted(next);
    setAcceptedCookies(next);
    const back = restoreFocus;
    restoreFocus = undefined;
    hideModal("Cookies");
    if (back?.isConnected) back.focus();
  };

  return (
    <AnimatedModal
      id="Cookies"
      mode="dialog"
      shell="banner"
      labelledBy={TITLE_ID}
      describedBy={COPY_ID}
      modalClass="flex h-auto max-h-full min-h-0 w-full max-w-none flex-col items-stretch gap-2 overflow-x-hidden overflow-y-auto rounded-none px-3 py-2 ring-1 sm:px-3 sm:py-2"
      closeOnEscape={false}
      closeOnWrapperClick={false}
      afterShow={fitConsentBanner}
      onEscape={() => {
        save({
          security: true,
          analytics: false,
          doNotSellOrShare: true,
        });
      }}
    >
      <H3
        id={TITLE_ID}
        text="Privacy"
        fa={{ icon: "fa-cookie-bite" }}
        class="mb-0 shrink-0 pb-0 text-sm"
      />
      <p
        id={COPY_ID}
        class="m-0 w-full text-sm leading-snug break-words whitespace-normal"
      >
        {CONSENT_ESSENTIAL_COPY}{" "}
        <a href="/privacy" class="text-main underline">
          Privacy policy
        </a>
      </p>
      <Show
        when={!showSettings()}
        fallback={
          <ConsentDetails
            accepted={accepted()}
            setAccepted={setAccepted}
            save={save}
            onBack={() => setShowSettings(false)}
          />
        }
      >
        <div class="contents">
          <div class="grid w-full shrink-0 grid-cols-2 gap-2">
            <Button
              id="consent-accept"
              text="accept analytics"
              onClick={() => {
                save({
                  security: true,
                  analytics: true,
                  doNotSellOrShare: accepted().doNotSellOrShare,
                });
              }}
            />
            <Button
              id="consent-reject"
              text="reject analytics"
              onClick={() => {
                save({
                  security: true,
                  analytics: false,
                  doNotSellOrShare: true,
                });
              }}
            />
          </div>
          <Button
            text="more options"
            variant="text"
            class="shrink-0"
            onClick={() => setShowSettings(true)}
          />
        </div>
      </Show>
    </AnimatedModal>
  );
}

function ConsentDetails(props: {
  accepted: ConsentRecord;
  setAccepted: (next: ConsentRecord) => void;
  save: (record: ConsentRecord) => void;
  onBack: () => void;
}): JSXElement {
  return (
    <>
      <SettingsSection
        title="security"
        description="Required Cloudflare cookies. They store no personal information."
        checked={true}
        disabled={true}
      />
      <SettingsSection
        title="analytics"
        description="Google Analytics 4. Off until you accept."
        checked={props.accepted.analytics}
        onChange={(checked) => {
          props.setAccepted({ ...props.accepted, analytics: checked });
        }}
      />
      <SettingsSection
        title="Do Not Sell or Share"
        description="Advertising stays off. Saved for later."
        checked={props.accepted.doNotSellOrShare}
        disabled={globalPrivacyControl()}
        onChange={(checked) => {
          props.setAccepted({ ...props.accepted, doNotSellOrShare: checked });
        }}
      />
      <Button
        id="consent-save"
        text="save"
        class="shrink-0"
        onClick={() => props.save(props.accepted)}
      />
      <Button
        text="back"
        variant="text"
        class="shrink-0"
        onClick={() => props.onBack()}
      />
    </>
  );
}

function SettingsSection(props: {
  title: string;
  description: string | JSXElement;
  checked: boolean;
  disabled?: boolean;
  hideCheckbox?: boolean;
  onChange?: (checked: boolean) => void;
}): JSXElement {
  return (
    <label
      class={cn(
        "grid grid-cols-[auto_1fr] items-center gap-2",
        props.hideCheckbox && "grid-cols-1",
      )}
    >
      <div class="grid gap-1">
        <div class="text-sub">{props.title}</div>
        <div class="text-text">{props.description}</div>
      </div>
      <input
        type="checkbox"
        class="text-2xl"
        checked={props.checked}
        disabled={props.disabled}
        hidden={props.hideCheckbox}
        onChange={(e) => props.onChange?.(e.currentTarget.checked)}
      />
    </label>
  );
}
