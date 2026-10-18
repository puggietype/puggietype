import { JSXElement } from "solid-js";

import { BOT_BADGE, BOT_LABEL_ARIA } from "../bots";

/** visible "🤖 Bot" badge: bots are always disclosed in text, not emoji alone */
export function BotLabel(): JSXElement {
  return (
    <span
      class="mr-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-sub-alt px-2 py-0.5 align-middle text-xs leading-none font-(--font) text-text"
      role="img"
      aria-label={BOT_LABEL_ARIA}
      title={BOT_LABEL_ARIA}
      data-testid="mp-bot-label"
    >
      <span aria-hidden="true">{BOT_BADGE}</span>
      <span aria-hidden="true">Bot</span>
    </span>
  );
}
