import { createSignal, For, JSXElement, onCleanup, Show } from "solid-js";

import type { ReportReason, RoomState } from "../protocol";

import { Button } from "../../components/common/Button";
import { cn } from "../../utils/cn";
import { isBot } from "../bots";
import { REPORT_REASONS } from "../protocol";
import { reportPlayer } from "../race";
import { myId, reportOn, reports } from "../store";

/** preset reasons only: there is deliberately no free-text field */
export const REPORT_REASON_TEXT: Record<ReportReason, string> = {
  cheating: "cheating",
  afk: "afk / not racing",
  name: "offensive name",
  other: "something else",
};

/**
 * Report another human in the room: a flag button opening a small menu of
 * preset reasons. Hidden for ourselves, bots, players who left, or with
 * either report flag off.
 */
export function ReportButton(props: {
  room: RoomState;
  player: { id: string; name: string; isBot?: boolean };
  /** menu edge pinned to the flag: "left" opens rightward (flag near the left edge) */
  align?: "left" | "right";
}): JSXElement {
  const [open, setOpen] = createSignal(false);
  let wrapper: HTMLSpanElement | undefined;

  const visible = (): boolean =>
    reportOn() &&
    props.player.id !== myId() &&
    !isBot(props.player) &&
    props.room.players.some((p) => p.id === props.player.id && !isBot(p));
  const status = () => reports().get(props.player.id);
  const alignLeft = (): boolean => props.align === "left";

  const onDocClick = (e: MouseEvent): void => {
    if (wrapper !== undefined && !wrapper.contains(e.target as Node)) {
      setOpen(false);
    }
  };
  document.addEventListener("click", onDocClick);
  onCleanup(() => document.removeEventListener("click", onDocClick));

  const pick = (reason: ReportReason): void => {
    setOpen(false);
    reportPlayer(props.player.id, reason);
  };

  return (
    <Show when={visible()}>
      <Show
        when={status() === undefined}
        fallback={
          <span
            // shrinks/wraps (own line in a wrapping row) instead of squeezing the name
            class="min-w-0 text-sm text-sub"
            role="status"
            data-testid="mp-report-thanks"
            data-player-id={props.player.id}
          >
            {status() === "received"
              ? "thanks, report received"
              : "sending report..."}
          </span>
        }
      >
        <span
          class="relative shrink-0"
          ref={(el) => (wrapper = el)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <Button
            variant="text"
            fa={{ icon: "fa-flag" }}
            class="py-1 text-sm"
            ariaLabel={`report ${props.player.name}`}
            balloon={{
              // short in results rows so the tooltip fits on phones (name is in aria-label + menu)
              text: alignLeft() ? "report" : `report ${props.player.name}`,
              position: alignLeft() ? "right" : "left",
            }}
            dataset={{
              "data-testid": "mp-report",
              "data-player-id": props.player.id,
              "aria-haspopup": "menu",
              "aria-expanded": String(open()),
            }}
            onClick={() => setOpen(!open())}
          />
          <Show when={open()}>
            <div
              class={cn(
                "absolute top-full z-10 grid min-w-max gap-1 rounded bg-bg p-2 text-left shadow-lg",
                alignLeft() ? "left-0" : "right-0",
              )}
              role="menu"
              aria-label={`report ${props.player.name} for`}
              data-testid="mp-report-menu"
            >
              <div class="px-2 text-xs text-sub">
                report {props.player.name} for
              </div>
              <For each={REPORT_REASONS}>
                {(reason) => (
                  <Button
                    variant="text"
                    text={REPORT_REASON_TEXT[reason]}
                    class="justify-start px-2 py-1 text-sm"
                    dataset={{
                      "data-testid": "mp-report-reason",
                      "data-reason": reason,
                      role: "menuitem",
                    }}
                    onClick={() => pick(reason)}
                  />
                )}
              </For>
            </div>
          </Show>
        </span>
      </Show>
    </Show>
  );
}
