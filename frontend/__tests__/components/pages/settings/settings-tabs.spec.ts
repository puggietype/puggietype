import { describe, expect, it } from "vitest";

import {
  moveSettingsTab,
  sectionDomId,
  SETTINGS_SECTIONS,
  SETTINGS_TABS,
  tabForHash,
} from "../../../../src/ts/components/pages/settings/settings-tabs";

describe("settings tabs", () => {
  it("uses Graphics, Sound, and Gameplay", () => {
    expect(SETTINGS_TABS.map((tab) => tab.id)).toEqual([
      "graphics",
      "sound",
      "gameplay",
    ]);
    expect(SETTINGS_TABS.map((tab) => tab.label)).toEqual([
      "Graphics",
      "Sound",
      "Gameplay",
    ]);
  });

  it("keeps every previous settings section", () => {
    expect(
      SETTINGS_SECTIONS.map((section) => sectionDomId(section.title)),
    ).toEqual([
      "group_caret",
      "group_appearance",
      "group_theme",
      "group_hideElements",
      "group_sound",
      "group_behavior",
      "group_input",
      "group_dangerZone",
    ]);
    expect(new Set(SETTINGS_SECTIONS.map((section) => section.tab))).toEqual(
      new Set(["graphics", "sound", "gameplay"]),
    );
  });

  it("maps the old section hashes onto a tab", () => {
    expect(tabForHash("#group_behavior")).toBe("gameplay");
    expect(tabForHash("group_input")).toBe("gameplay");
    expect(tabForHash("#group_dangerZone")).toBe("gameplay");
    expect(tabForHash("#group_sound")).toBe("sound");
    expect(tabForHash("#group_caret")).toBe("graphics");
    expect(tabForHash("#group_appearance")).toBe("graphics");
    expect(tabForHash("#group_theme")).toBe("graphics");
    expect(tabForHash("#group_hideElements")).toBe("graphics");
    expect(tabForHash("#missing")).toBeUndefined();
  });

  it("moves with arrows, home, and end, and ignores modifier chords", () => {
    expect(moveSettingsTab(0, "ArrowRight", 3)).toBe(1);
    expect(moveSettingsTab(1, "ArrowDown", 3)).toBe(2);
    expect(moveSettingsTab(2, "ArrowRight", 3)).toBe(0);
    expect(moveSettingsTab(0, "ArrowLeft", 3)).toBe(2);
    expect(moveSettingsTab(0, "ArrowUp", 3)).toBe(2);
    expect(moveSettingsTab(2, "Home", 3)).toBe(0);
    expect(moveSettingsTab(0, "End", 3)).toBe(2);
    expect(moveSettingsTab(1, "a", 3)).toBeNull();
    expect(
      moveSettingsTab(1, "ArrowRight", 3, {
        alt: false,
        ctrl: true,
        meta: false,
        shift: false,
      }),
    ).toBeNull();
  });
});
