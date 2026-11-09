import { createEffect, createSignal, JSXElement, onCleanup } from "solid-js";

import {
  type ConsentRecord,
  globalPrivacyControl,
} from "../../analytics/consent";
import { getAcceptedCookies, setAcceptedCookies } from "../../cookies";
import { hideModal, isModalOpen } from "../../states/modals";
import { cn } from "../../utils/cn";
import { AnimatedModal } from "../common/AnimatedModal";
import { AnimeSwitch } from "../common/anime";
import { AnimeMatch } from "../common/anime/AnimeMatch";
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

function publishBannerBlock(): void {
  const dialog = document.getElementById("CookiesModal");
  const height = dialog?.getBoundingClientRect().height ?? 0;
  if (height <= 0) return;
  document.documentElement.style.setProperty(
    "--consent-banner-block",
    `${Math.ceil(height)}px`,
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
      document.documentElement.style.removeProperty("--consent-banner-block");
      return;
    }
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
    dialog?.addEventListener("focusin", onFocusIn);
    requestAnimationFrame(publishBannerBlock);
    onCleanup(() => {
      dialog?.removeEventListener("focusin", onFocusIn);
      document.body.removeAttribute("data-consent-banner");
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
      modalClass="max-h-[min(20rem,calc(100dvh-2rem))] max-w-none gap-3 overflow-auto p-4 sm:p-4"
      closeOnEscape={false}
      closeOnWrapperClick={false}
      afterShow={publishBannerBlock}
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
        text="Privacy and cookie settings"
        fa={{ icon: "fa-cookie-bite" }}
        class="mb-0 pb-0 text-lg"
      />
      <AnimeSwitch
        exitBeforeEnter
        animeProps={{
          initial: {
            opacity: 0,
            duration: 125,
          },
          animate: {
            opacity: 1,
            duration: 125,
          },
          exit: {
            opacity: 0,
            duration: 125,
          },
        }}
      >
        <AnimeMatch when={!showSettings()}>
          <div class="grid gap-3">
            <p id={COPY_ID} class="m-0">
              Google Analytics 4 is optional. It does not run until you accept.
              Rejecting means it never loads. We do not load advertising
              scripts.
            </p>
            <div class="grid grid-cols-2 gap-2">
              <Button
                id="consent-accept"
                text="accept analytics"
                class="w-full"
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
                class="w-full"
                onClick={() => {
                  save({
                    security: true,
                    analytics: false,
                    doNotSellOrShare: true,
                  });
                }}
              />
            </div>
            <SettingsSection
              title="Do Not Sell or Share"
              description="Advertising purposes stay off. This preference is saved for later."
              checked={accepted().doNotSellOrShare}
              disabled={globalPrivacyControl()}
              onChange={(checked) => {
                setAccepted({ ...accepted(), doNotSellOrShare: checked });
              }}
            />
            <Button
              text="more options"
              variant="text"
              onClick={() => setShowSettings(true)}
            />
          </div>
        </AnimeMatch>
        <AnimeMatch when={showSettings()}>
          <div class="grid gap-3">
            <SettingsSection
              title="security"
              description={
                <div>
                  We use Cloudflare cookies to improve security and performance
                  of our site. They do not store any personal information and
                  are required.
                </div>
              }
              checked={true}
              disabled={true}
            />
            <SettingsSection
              title="analytics"
              description="Google Analytics 4. Off until you accept where consent is required."
              checked={accepted().analytics}
              onChange={(checked) => {
                setAccepted({ ...accepted(), analytics: checked });
              }}
            />
            <SettingsSection
              title="Do Not Sell or Share"
              description="Advertising purposes stay off. This preference is saved for later."
              checked={accepted().doNotSellOrShare}
              disabled={globalPrivacyControl()}
              onChange={(checked) => {
                setAccepted({ ...accepted(), doNotSellOrShare: checked });
              }}
            />
            <Button
              text="save"
              class="w-full"
              onClick={() => {
                save(accepted());
              }}
            />
          </div>
        </AnimeMatch>
      </AnimeSwitch>
    </AnimatedModal>
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
