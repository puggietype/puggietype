import { For, JSXElement, Show } from "solid-js";

import {
  getSupportContext,
  SUPPORT_DISCLAIMER_BEFORE_EMAIL,
  SUPPORT_EMAIL,
  SUPPORT_HEADING,
  supportIntro,
  visibleTipLinks,
} from "../../../constants/support";
import { H2 } from "../../common/Headers";

const linkClass = "text-sub underline hover:text-text";

/** About: optional tips (Ko-fi / GitHub Sponsors) with Legal's disclaimer */
export function SupportSection(): JSXElement {
  const links = visibleTipLinks(getSupportContext(window.location.pathname));
  return (
    <Show when={links.length > 0}>
      <section id="support" data-testid="support-section">
        <H2 text={SUPPORT_HEADING} />
        <p data-testid="support-intro">{supportIntro(links)}</p>
        <ul data-testid="support-links">
          <For each={links}>
            {(link) => (
              <li>
                <a
                  class={linkClass}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </a>
              </li>
            )}
          </For>
        </ul>
        <p class="text-sm text-sub italic" data-testid="support-disclaimer">
          {SUPPORT_DISCLAIMER_BEFORE_EMAIL}{" "}
          <a class={linkClass} href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </Show>
  );
}
