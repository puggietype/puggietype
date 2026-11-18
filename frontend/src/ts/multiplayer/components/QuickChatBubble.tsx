import {
  createEffect,
  createMemo,
  createSignal,
  JSXElement,
  on,
  onCleanup,
  Show,
} from "solid-js";

import { getTheme } from "../../states/theme";
import { cn } from "../../utils/cn";
import { prefersReducedMotion } from "../../utils/misc";
import {
  quickChatItem,
  quickChatPhaseOk,
  type QuickChatEntry,
} from "../quick-chat";
import {
  mutedPlayers,
  quickChatAvailableNow,
  quickChatHidden,
  quickChatLatest,
  room,
} from "../store";
import { bubbleTextColor } from "../theme-contrast";
import { QuickChatFace } from "./QuickChatFace";

/** a bubble lives this long after its message arrived (fade included) */
export const BUBBLE_MS = 4000;
/** the fade-out at the end of BUBBLE_MS (skipped under reduced motion) */
export const BUBBLE_FADE_MS = 250;

/**
 * A player's latest quick-chat as a short-lived bubble, placed right after
 * their name. Decorative (aria-hidden): the live region in QuickChat.tsx is
 * the one announcement, and its history keeps the message. Removal is
 * timer-driven, so reduced motion (no pop, no fade) keeps the same timing.
 * Lobby and results only: never during a race.
 */
export function QuickChatBubble(props: { playerId: string }): JSXElement {
  const [shown, setShown] = createSignal<QuickChatEntry | undefined>();
  const [fading, setFading] = createSignal(false);
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = (): void => {
    clearTimeout(fadeTimer);
    clearTimeout(endTimer);
  };

  // memo: only this player's entry changing restarts the timer
  const latest = createMemo(() => quickChatLatest().get(props.playerId));
  createEffect(
    on(latest, (entry) => {
      stop();
      setFading(false);
      // a remount (lobby -> results) shows only what is left of the 4s
      const left = entry === undefined ? 0 : entry.at + BUBBLE_MS - Date.now();
      if (entry === undefined || left <= 0) {
        setShown(undefined);
        return;
      }
      setShown(entry);
      if (!prefersReducedMotion() && left > BUBBLE_FADE_MS) {
        fadeTimer = setTimeout(() => setFading(true), left - BUBBLE_FADE_MS);
      }
      endTimer = setTimeout(() => {
        setShown(undefined);
        setFading(false);
      }, left);
    }),
  );
  onCleanup(stop);

  const visible = (): QuickChatEntry | undefined => {
    const r = room();
    const ok =
      r !== undefined &&
      quickChatPhaseOk(r.phase) &&
      quickChatAvailableNow() &&
      !quickChatHidden() &&
      !mutedPlayers().has(props.playerId);
    return ok ? shown() : undefined;
  };

  return (
    // keyed: a new message re-creates the bubble, so it pops again
    <Show when={visible()} keyed>
      {(e) => (
        <span
          aria-hidden="true"
          class={cn(
            // shrinks (ellipsis) well before the name does, never below ~2 letters
            "qc-bubble pointer-events-none relative inline-flex max-w-48 min-w-12 shrink-[100] items-center pl-1.5 transition-opacity duration-250 ease-out",
            fading() && "opacity-0",
          )}
          // text + outline: theme text, or black/white where text misses AA on sub-alt
          style={{ "--qc-fg": bubbleTextColor(getTheme()).css }}
          data-testid="mp-quickchat-bubble"
          data-player-id={props.playerId}
          data-preset-id={e.presetId}
          data-fading={fading() ? "true" : undefined}
        >
          <span class="flex min-w-0 items-center gap-1 overflow-hidden rounded-lg border border-(--qc-fg) bg-sub-alt px-2 py-0.5 text-sm leading-tight text-(--qc-fg) [&>span:last-child]:min-w-0 [&>span:last-child]:truncate">
            <QuickChatFace item={quickChatItem(e.presetId)} />
          </span>
          {/* tail pointing back at the name; drawn over the bubble's left border */}
          <span class="absolute top-1/2 left-0.5 size-2 -translate-y-1/2 rotate-45 border-b border-l border-(--qc-fg) bg-sub-alt"></span>
        </span>
      )}
    </Show>
  );
}
