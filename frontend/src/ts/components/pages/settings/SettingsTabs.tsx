import { For, JSXElement } from "solid-js";

import { cn } from "../../../utils/cn";
import { Fa } from "../../common/Fa";
import {
  moveSettingsTab,
  SETTINGS_TABS,
  settingsPanelDomId,
  settingsTabDomId,
  type SettingsTabId,
} from "./settings-tabs";

export function SettingsTabs(props: {
  tab: SettingsTabId;
  onChange: (tab: SettingsTabId) => void;
  class?: string;
}): JSXElement {
  const buttons: Partial<Record<SettingsTabId, HTMLButtonElement>> = {};

  const onKeyDown = (event: KeyboardEvent): void => {
    const current = SETTINGS_TABS.findIndex((item) => item.id === props.tab);
    const next = moveSettingsTab(current, event.key, SETTINGS_TABS.length, {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey,
    });
    if (next === null) return;
    event.preventDefault();
    const id = SETTINGS_TABS[next]?.id;
    if (id === undefined) return;
    props.onChange(id);
    buttons[id]?.focus();
  };

  return (
    <div class={props.class}>
      <div
        role="tablist"
        aria-label="Settings categories"
        aria-orientation="horizontal"
        class="mx-auto grid w-full grid-cols-3 overflow-hidden rounded bg-sub-alt text-em-xs lg:w-max"
        onKeyDown={onKeyDown}
      >
        <For each={SETTINGS_TABS}>
          {(item) => {
            const selected = (): boolean => props.tab === item.id;
            return (
              <button
                ref={(el) => {
                  buttons[item.id] = el;
                }}
                type="button"
                role="tab"
                id={settingsTabDomId(item.id)}
                aria-selected={selected() ? "true" : "false"}
                aria-controls={settingsPanelDomId(item.id)}
                tabIndex={selected() ? 0 : -1}
                class={cn(
                  "inline-flex items-center justify-center gap-2 px-4 py-3",
                  "focus-visible:shadow-[0_0_0_0.1rem_var(--bg-color),_0_0_0_0.2rem_var(--text-color)] focus-visible:outline-none",
                  selected()
                    ? "bg-main text-bg"
                    : "bg-transparent text-sub hover:text-text",
                )}
                onClick={() => props.onChange(item.id)}
              >
                <Fa icon={item.icon} />
                {item.label}
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}
