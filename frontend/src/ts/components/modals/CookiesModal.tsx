import { createEffect, createSignal, JSXElement } from "solid-js";

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

function draftFrom(stored: ConsentRecord | null): ConsentRecord {
  const base: ConsentRecord = stored ?? {
    security: true,
    analytics: false,
    doNotSellOrShare: false,
  };
  if (globalPrivacyControl()) return { ...base, doNotSellOrShare: true };
  return base;
}

export function CookiesModal(): JSXElement {
  const [showSettings, setShowSettings] = createSignal(false);
  const [accepted, setAccepted] = createSignal<ConsentRecord>(
    draftFrom(getAcceptedCookies()),
  );

  createEffect(() => {
    const open = isModalOpen("Cookies");
    const stored = getAcceptedCookies();
    if (!open) {
      setShowSettings(false);
      setAccepted(draftFrom(stored));
    }
  });

  const save = (record: ConsentRecord): void => {
    const next = globalPrivacyControl()
      ? { ...record, doNotSellOrShare: true }
      : record;
    setAccepted(next);
    setAcceptedCookies(next);
    hideModal("Cookies");
  };

  return (
    <AnimatedModal
      id="Cookies"
      modalClass="max-w-[500px]"
      wrapperClass="justify-end items-end"
      closeOnEscape={false}
      closeOnWrapperClick={false}
      onEscape={() => {
        save({
          security: true,
          analytics: false,
          doNotSellOrShare: true,
        });
      }}
      afterShow={() => {
        document.getElementById("consent-accept")?.focus();
      }}
    >
      <H3
        text="Privacy and cookie settings"
        fa={{ icon: "fa-cookie-bite" }}
        class="mb-0 pb-0 text-2xl"
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
          <div class="grid gap-4">
            <div>
              Google Analytics 4 is optional and helps us understand site
              traffic. We do not load advertising scripts. Where consent is
              required, Google Analytics 4 does not run until you accept.
              Rejecting means it never loads.
            </div>
            <SettingsSection
              title="Do Not Sell or Share"
              description="We do not sell or share personal information. This saves that preference for later. Advertising purposes stay off."
              checked={accepted().doNotSellOrShare}
              disabled={globalPrivacyControl()}
              onChange={(checked) => {
                setAccepted({ ...accepted(), doNotSellOrShare: checked });
              }}
            />
            <div class="grid gap-2">
              <Button
                id="consent-accept"
                text="accept analytics"
                active={true}
                onClick={() => {
                  save({
                    security: true,
                    analytics: true,
                    doNotSellOrShare: accepted().doNotSellOrShare,
                  });
                }}
              />
              <Button
                text="reject analytics"
                onClick={() => {
                  save({
                    security: true,
                    analytics: false,
                    doNotSellOrShare: true,
                  });
                }}
              />
              <Button
                text="more options"
                onClick={() => setShowSettings(true)}
              />
            </div>
          </div>
        </AnimeMatch>
        <AnimeMatch when={showSettings()}>
          <div class="grid gap-4">
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
