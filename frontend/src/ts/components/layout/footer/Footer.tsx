import { JSXElement } from "solid-js";
import { envConfig } from "virtual:env-config";

import { openConsentSettings } from "../../../analytics/install";
import { getIsScreenshotting } from "../../../states/core";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { Button } from "../../common/Button";
import { Keytips } from "./Keytips";
import { ThemeIndicator } from "./ThemeIndicator";
import { VersionButton } from "./VersionButton";

const linkClass = "text-sub underline hover:text-text";

export function Footer(): JSXElement {
  return (
    <footer
      class={cn("relative text-xs text-sub", {
        "opacity-0": getIsScreenshotting(),
      })}
    >
      <Keytips />

      <div
        class={cn("-m-2 flex justify-between gap-8 transition-opacity", {
          "opacity-0": getFocus(),
        })}
      >
        <div class="grid grid-cols-1 justify-items-start xs:grid-cols-2 sm:grid-cols-4 lg:flex">
          <Button
            variant="text"
            text="terms"
            fa={{
              icon: "fa-file-contract",
              fixedWidth: true,
            }}
            href="/terms"
          />
          <Button
            href="/privacy"
            variant="text"
            text="privacy"
            fa={{
              icon: "fa-lock",
              fixedWidth: true,
            }}
          />
          <Button
            variant="text"
            text="Privacy and cookie settings"
            fa={{
              icon: "fa-cookie-bite",
              fixedWidth: true,
            }}
            dataset={{ "data-testid": "privacy-cookie-settings" }}
            onClick={() => {
              openConsentSettings();
            }}
          />
          <div class="flex items-center p-2" data-testid="legal-notice">
            <span>
              Based on{" "}
              <a
                class={linkClass}
                href="https://github.com/monkeytypegame/monkeytype"
                target="_blank"
                rel="noopener"
              >
                Monkeytype
              </a>
              ,{" "}
              <a
                class={linkClass}
                href={envConfig.licenseUrl}
                target="_blank"
                rel="noopener"
              >
                GPL-3.0
              </a>
              , no warranty,{" "}
              <a class={linkClass} href={envConfig.sourceUrl}>
                source
              </a>
            </span>
          </div>
          {/* plain links: the static pages need a full page load */}
          <nav
            class="flex items-center gap-2 p-2"
            aria-label="guides"
            data-testid="guide-links"
          >
            <a class={linkClass} href="/guide/about">
              about
            </a>
            <a class={linkClass} href="/faq">
              faq
            </a>
            <a class={linkClass} href="/guide/">
              guides
            </a>
            <a class={linkClass} href="/contact">
              contact
            </a>
            <a class={linkClass} href="/creators">
              creators
            </a>
            {
              // flagged tip entry, never on steam. Literals + inline defines
              // so flags-off and Steam builds can drop this (no support.ts
              // import, no Ko-fi/Sponsors URLs in the footer chunk). The
              // href is the About section so the disclaimer sits next to
              // the tip links.
              // oxlint-disable-next-line solid/prefer-show -- build-time flags, not reactive
              (__FEATURE_KOFI__ || __FEATURE_GITHUB_SPONSORS__) &&
              !(
                typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam"
              ) ? (
                <a
                  class={linkClass}
                  href="/guide/about#support"
                  data-testid="support-footer-link"
                >
                  Support PuggieType
                </a>
              ) : null
            }
          </nav>
        </div>
        <div class="flex flex-col items-end text-right lg:flex-row">
          <ThemeIndicator />
          <VersionButton />
        </div>
      </div>
    </footer>
  );
}
