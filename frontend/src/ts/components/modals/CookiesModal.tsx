import {
  createEffect,
  createSignal,
  JSXElement,
  onCleanup,
  Show,
} from "solid-js";

import {
  type ConsentRecord,
  globalPrivacyControl,
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
  document.documentElement.style.removeProperty("--consent-banner-block");
}

/** Publish the bar height so the page scrolls above it instead of under it. */
function fitConsentBanner(): void {
  const dialog = document.getElementById("CookiesModal");
  if (!(dialog instanceof HTMLElement)) return;
  const height = Math.ceil(dialog.getBoundingClientRect().height);
  if (height <= 0) return;
  document.documentElement.style.setProperty(
    "--consent-banner-block",
    `${height}px`,
  );
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
    const onWords = new MutationObserver(() => fitConsentBanner());
    if (words !== null) onWords.observe(words, { childList: true });
    dialog?.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onEscape, true);
    window.addEventListener("resize", fitConsentBanner);
    void document.fonts?.ready.then(() => fitConsentBanner());
    requestAnimationFrame(fitConsentBanner);
    onCleanup(() => {
      onWords.disconnect();
      dialog?.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onEscape, true);
      window.removeEventListener("resize", fitConsentBanner);
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
      modalClass="flex h-auto max-h-none w-full max-w-none flex-wrap items-center gap-2 rounded-none px-3 py-1 ring-1 sm:flex-nowrap sm:px-3 sm:py-1"
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
          <p
            id={COPY_ID}
            class="m-0 w-full min-w-0 flex-1 truncate text-sm sm:w-auto"
          >
            Google Analytics 4 is optional. It does not run until you accept.
            Rejecting means it never loads.
          </p>
          <div class="grid w-full shrink-0 grid-cols-2 gap-2 sm:w-auto">
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
