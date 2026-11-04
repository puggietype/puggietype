import type { FaSolidIcon } from "../../../types/font-awesome";
import { wordsToCamelCase } from "../../../utils/strings";

export const SETTINGS_TABS = [
  { id: "graphics", label: "Graphics", icon: "fa-image" },
  { id: "sound", label: "Sound", icon: "fa-volume-up" },
  { id: "gameplay", label: "Gameplay", icon: "fa-gamepad" },
] as const satisfies readonly {
  id: string;
  label: string;
  icon: FaSolidIcon;
}[];

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

/**
 * Existing settings sections, in their previous order within each tab.
 * `sectionDomId` keeps the old `#group_*` hashes working.
 */
export const SETTINGS_SECTIONS = [
  { title: "caret", tab: "graphics" },
  { title: "appearance", tab: "graphics" },
  { title: "theme", tab: "graphics" },
  { title: "hide elements", tab: "graphics" },
  { title: "sound", tab: "sound" },
  { title: "behavior", tab: "gameplay" },
  { title: "input", tab: "gameplay" },
  { title: "danger zone", tab: "gameplay" },
] as const satisfies readonly { title: string; tab: SettingsTabId }[];

export function sectionDomId(title: string): string {
  return `group_${wordsToCamelCase(title)}`;
}

export function settingsTabDomId(id: SettingsTabId): string {
  return `settings-tab-${id}`;
}

export function settingsPanelDomId(id: SettingsTabId): string {
  return `settings-panel-${id}`;
}

export function isSettingsTabId(
  value: string | null | undefined,
): value is SettingsTabId {
  return SETTINGS_TABS.some((item) => item.id === value);
}

export function tabForHash(hash: string): SettingsTabId | undefined {
  const id = hash.startsWith("#") ? hash.slice(1) : hash;
  return SETTINGS_SECTIONS.find((item) => sectionDomId(item.title) === id)?.tab;
}

export type TabKeyModifiers = {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
};

const NO_MODIFIERS: TabKeyModifiers = {
  alt: false,
  ctrl: false,
  meta: false,
  shift: false,
};

/**
 * Horizontal tab stops. Left/Up and Right/Down move, and both ends wrap.
 * Home and End jump. Modifier chords are left to the browser.
 */
export function moveSettingsTab(
  current: number,
  key: string,
  count: number,
  modifiers: TabKeyModifiers = NO_MODIFIERS,
): number | null {
  if (count <= 0) return null;
  if (modifiers.alt || modifiers.ctrl || modifiers.meta || modifiers.shift) {
    return null;
  }
  if (!Number.isInteger(current) || current < 0 || current >= count) {
    return null;
  }
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
