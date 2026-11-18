import {
  createEffect,
  createSignal,
  createUniqueId,
  For,
  JSXElement,
  on,
  onCleanup,
  Show,
  untrack,
} from "solid-js";

import type { RoomState } from "../protocol";

import { Button } from "../../components/common/Button";
import { cn } from "../../utils/cn";
import {
  QUICK_CHAT_EMOTE_ITEMS,
  QUICK_CHAT_LINE_ITEMS,
  quickChatAnnouncement,
  quickChatItem,
  quickChatPhaseOk,
  type QuickChatEntry,
  type QuickChatItem,
} from "../quick-chat";
import { sendQuickChat, setQuickChatHidden } from "../race";
import {
  quickChatAvailableNow,
  quickChatCooldownUntil,
  quickChatFeed,
  quickChatHidden,
  quickChatRepeatLocked,
  quickChatSlowHint,
} from "../store";
import { QuickChatFace } from "./QuickChatFace";

/** screen readers hear at most one quick-chat announcement per this many ms */
const ANNOUNCE_GAP_MS = 1500;
/** how long "sent: gg" stays up */
const SENT_HINT_MS = 2000;

/**
 * The quick-chat panel: preset lines and emotes only, there is deliberately no text field.
 * "lobby": always open. "results": a collapsed disclosure so rematch and leave stay above the fold.
 */
export function QuickChat(props: {
  room: RoomState;
  variant: "lobby" | "results";
}): JSXElement {
  const [expanded, setExpanded] = createSignal(
    untrack(() => props.variant === "lobby"),
  );
  const [sentText, setSentText] = createSignal<string | undefined>();
  const [announcement, setAnnouncement] = createSignal("");
  const panelId = `mp-quickchat-panel-${createUniqueId()}`;

  const phaseOk = (): boolean => quickChatPhaseOk(props.room.phase);
  const cooling = (): boolean => quickChatCooldownUntil() > 0;
  const nameOf = (playerId: string): string =>
    props.room.players.find((p) => p.id === playerId)?.name ?? "a player";

  // coalesced screen-reader announcements: one message is read out, a burst becomes a count
  let seen = quickChatFeed().at(-1)?.seq ?? 0;
  let queued: QuickChatEntry[] = [];
  let lastAnnouncedAt = 0;
  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  const flush = (): void => {
    announceTimer = undefined;
    if (queued.length === 0) return;
    const first = queued[0] as QuickChatEntry;
    setAnnouncement(
      queued.length === 1
        ? quickChatAnnouncement(nameOf(first.playerId), first.presetId)
        : `${queued.length} new quick-chat messages`,
    );
    queued = [];
    lastAnnouncedAt = Date.now();
  };
  createEffect(
    on(quickChatFeed, (feed) => {
      const fresh = feed.filter((e) => e.seq > seen);
      if (fresh.length === 0) return;
      seen = (fresh.at(-1) as QuickChatEntry).seq;
      queued.push(...fresh);
      if (announceTimer !== undefined) return;
      const wait = Math.max(0, lastAnnouncedAt + ANNOUNCE_GAP_MS - Date.now());
      announceTimer = setTimeout(flush, wait);
    }),
  );
  let sentTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    clearTimeout(announceTimer);
    clearTimeout(sentTimer);
  });

  const send = (item: QuickChatItem): void => {
    if (!sendQuickChat(item.id)) return;
    setSentText(`sent: ${item.text}`);
    clearTimeout(sentTimer);
    sentTimer = setTimeout(() => setSentText(undefined), SENT_HINT_MS);
  };

  const hint = (): string | undefined => {
    if (!phaseOk()) return "quick-chat is paused while a race runs";
    if (quickChatSlowHint()) return "slow down a moment";
    return sentText();
  };

  const PickerButton = (p: { item: QuickChatItem }): JSXElement => {
    const blocked = (): boolean =>
      !phaseOk() || cooling() || quickChatRepeatLocked().has(p.item.id);
    return (
      <Button
        class={cn(
          "min-h-11 min-w-11 px-3 py-2 text-sm",
          blocked() && "opacity-50",
        )}
        // aria-disabled (not disabled) keeps focus on the button while the cooldown runs
        dataset={{
          "data-testid": `mp-quickchat-${p.item.kind}-${p.item.id}`,
          "aria-disabled": String(blocked()),
        }}
        ariaLabel={
          p.item.kind === "emote"
            ? `send emote: ${p.item.text}`
            : `send: ${p.item.text}`
        }
        onClick={() => send(p.item)}
      >
        <span class="inline-flex items-center gap-2">
          <QuickChatFace item={p.item} />
        </span>
      </Button>
    );
  };

  return (
    <Show when={quickChatAvailableNow()}>
      <section
        class="grid gap-3 rounded bg-bg p-3"
        aria-label="quick chat"
        data-testid="mp-quickchat"
        data-variant={props.variant}
      >
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Show
            when={props.variant === "results" && !quickChatHidden()}
            fallback={<h3 class="text-sm text-sub">quick chat</h3>}
          >
            <Button
              variant="text"
              fa={{ icon: expanded() ? "fa-chevron-up" : "fa-chevron-down" }}
              text="quick chat"
              class="py-1 text-sm"
              dataset={{
                "data-testid": "mp-quickchat-toggle",
                "aria-expanded": String(expanded()),
                "aria-controls": panelId,
              }}
              onClick={() => setExpanded(!expanded())}
            />
          </Show>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-sub">
            <input
              type="checkbox"
              role="switch"
              class="size-4 cursor-pointer accent-main"
              data-testid="mp-quickchat-hide"
              checked={quickChatHidden()}
              onChange={(e) => setQuickChatHidden(e.currentTarget.checked)}
            />
            hide quick-chat
          </label>
        </div>
        {/* the one polite live region; its text is only ever built from our own table */}
        <div
          class="sr-only"
          role="status"
          aria-live="polite"
          data-testid="mp-quickchat-live"
        >
          {announcement()}
        </div>
        <Show when={!quickChatHidden()}>
          {/* collapsed results panel: the latest message stays visible */}
          <Show when={props.variant === "results" && !expanded()}>
            <Show when={quickChatFeed().at(-1)}>
              {(e) => (
                <p
                  class="flex items-center gap-2 text-sm text-text"
                  data-testid="mp-quickchat-latest"
                >
                  <span class="text-sub">{nameOf(e().playerId)}</span>
                  <QuickChatFace item={quickChatItem(e().presetId)} />
                </p>
              )}
            </Show>
          </Show>
          <div
            id={panelId}
            class={cn(
              "grid gap-3",
              props.variant === "results" && !expanded() && "hidden",
            )}
            data-testid="mp-quickchat-panel"
          >
            <ul
              class="grid min-h-6 gap-1 text-sm"
              aria-label="recent quick-chat"
              data-testid="mp-quickchat-feed"
            >
              <For each={quickChatFeed()}>
                {(e) => (
                  <li
                    class="flex min-w-0 flex-wrap items-center gap-x-2 text-text"
                    data-testid="mp-quickchat-feed-item"
                    data-player-id={e.playerId}
                    data-preset-id={e.presetId}
                  >
                    <span class="min-w-0 truncate text-sub">
                      {nameOf(e.playerId)}
                    </span>
                    <QuickChatFace item={quickChatItem(e.presetId)} />
                  </li>
                )}
              </For>
            </ul>
            <div
              class="flex flex-wrap gap-2"
              role="group"
              aria-label="Quick chat lines"
            >
              <For each={QUICK_CHAT_LINE_ITEMS}>
                {(item) => <PickerButton item={item} />}
              </For>
            </div>
            <div
              class="flex flex-wrap gap-2"
              role="group"
              aria-label="Quick chat emotes"
            >
              <For each={QUICK_CHAT_EMOTE_ITEMS}>
                {(item) => <PickerButton item={item} />}
              </For>
            </div>
            <p class="min-h-5 text-sm text-sub" data-testid="mp-quickchat-hint">
              {hint()}
            </p>
          </div>
        </Show>
      </section>
    </Show>
  );
}
