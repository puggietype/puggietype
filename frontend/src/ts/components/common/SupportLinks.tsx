import { JSXElement, Show } from "solid-js";

import { SUPPORT_LINKS } from "../../constants/support";
import { cn } from "../../utils/cn";
import { Button } from "./Button";

const footerLink =
  "underline underline-offset-2 focus-visible:rounded-half focus-visible:outline-none";

/**
 * Ko-fi is the primary tip link. GitHub Sponsors sits beside it.
 * Plain anchors only: no onclick, no query params, no tracking.
 */
export function SupportLinks(props: {
  variant: "footer" | "page";
}): JSXElement {
  const page = (): boolean => props.variant === "page";

  return (
    <Show
      when={page()}
      fallback={
        <nav
          class="flex flex-wrap items-center gap-x-3 gap-y-1 p-2"
          aria-label="Support PuggieType"
          data-testid="support-links"
        >
          <span class="text-text">Support PuggieType</span>
          <a
            class={cn(footerLink, "font-semibold text-main hover:text-text")}
            href={SUPPORT_LINKS.KOFI_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Support PuggieType on Ko-fi (opens in a new tab)"
          >
            Ko-fi
          </a>
          <a
            class={cn(footerLink, "text-text hover:text-main")}
            href={SUPPORT_LINKS.SPONSORS_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Support PuggieType on GitHub Sponsors (opens in a new tab)"
          >
            GitHub Sponsors
          </a>
        </nav>
      }
    >
      <nav
        class="mt-4 flex flex-wrap items-center gap-2"
        aria-label="Tip options"
        data-testid="support-links"
      >
        <Button
          text="Ko-fi"
          href={SUPPORT_LINKS.KOFI_URL}
          ariaLabel="Support PuggieType on Ko-fi (opens in a new tab)"
          fa={{ icon: "fa-mug-hot", fixedWidth: true }}
        />
        <Button
          variant="text"
          text="GitHub Sponsors"
          href={SUPPORT_LINKS.SPONSORS_URL}
          ariaLabel="Support PuggieType on GitHub Sponsors (opens in a new tab)"
          class="[--themable-button-text:var(--text-color)]"
          fa={{ icon: "fa-github", variant: "brand", fixedWidth: true }}
        />
      </nav>
    </Show>
  );
}
