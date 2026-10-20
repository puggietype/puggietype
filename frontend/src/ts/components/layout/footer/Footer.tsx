import { JSXElement } from "solid-js";
import { envConfig } from "virtual:env-config";

import { getIsScreenshotting } from "../../../states/core";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { AdFooterLinks } from "../../ads/AdFooterLinks";
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
        </div>
        <div class="flex flex-col items-end text-right lg:flex-row">
          <ThemeIndicator />
          <VersionButton />
        </div>
      </div>
      <AdFooterLinks />
    </footer>
  );
}
