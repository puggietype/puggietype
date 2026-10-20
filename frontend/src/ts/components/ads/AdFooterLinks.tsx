import { JSXElement, Show } from "solid-js";

import { getAdProvider } from "../../ads/provider";
import { isAdsActive } from "../../ads/state";
import { getFocus } from "../../states/test";
import { cn } from "../../utils/cn";
import { Button } from "../common/Button";

/** the privacy policy's "Your choices: Do Not Sell or Share" section */
export const DO_NOT_SELL_HREF =
  "/privacy#:~:text=Your%20choices%3A%20Do%20Not%20Sell%20or%20Share";

/** the browser sends a Global Privacy Control opt-out */
export function hasGpcSignal(nav: Navigator = navigator): boolean {
  return (
    (nav as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  );
}

/**
 * Footer links that only exist while ads are active: reopen the consent
 * message, and Do Not Sell or Share with the opted-out status. Restricted
 * data processing is on for everyone, so everyone is opted out; a GPC
 * signal is shown as honored (CCPA regs §7025).
 */
export function AdFooterLinks(): JSXElement {
  return (
    <Show when={isAdsActive()}>
      <div
        class={cn(
          "-mx-2 flex flex-wrap items-center gap-x-4 transition-opacity",
          {
            "opacity-0": getFocus(),
          },
        )}
        data-testid="ads-footer"
      >
        <Button
          variant="text"
          text="Privacy and cookie settings"
          class="whitespace-nowrap"
          fa={{ icon: "fa-cookie-bite", fixedWidth: true }}
          dataset={{ "data-testid": "ads-privacy-settings" }}
          onClick={() => getAdProvider().openPrivacySettings()}
        />
        <div class="flex flex-wrap items-center gap-x-1 p-2">
          <a
            class="text-sub underline hover:text-text"
            href={DO_NOT_SELL_HREF}
            data-testid="ads-do-not-sell"
          >
            Do Not Sell or Share My Personal Information
          </a>
          <span data-testid="ads-opt-out-status">
            {"(you're opted out"}
            <Show when={hasGpcSignal()}>
              <span data-testid="ads-gpc-honored">
                {"; "}GPC signal honored
              </span>
            </Show>
            )
          </span>
        </div>
      </div>
    </Show>
  );
}
