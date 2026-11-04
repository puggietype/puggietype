import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/ts/utils/json-data", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../src/ts/utils/json-data")>();
  return {
    ...actual,
    getLayout: async (): Promise<Record<string, never>> => ({}),
  };
});

vi.mock("../../../../src/ts/utils/file-storage", () => ({
  default: {
    track: (): number => 0,
    hasFile: async (): Promise<boolean> => false,
    deleteFile: async (): Promise<void> => undefined,
  },
}));

import { sectionDomId } from "../../../../src/ts/components/pages/settings/settings-tabs";
import { SettingsPage } from "../../../../src/ts/components/pages/settings/SettingsPage";
import { isConfigKeyHidden } from "../../../../src/ts/constants/standalone";
import { setSettingsSearch } from "../../../../src/ts/states/settings-search";

const sectionTitles = [
  "caret",
  "appearance",
  "theme",
  "hide elements",
  "sound",
  "behavior",
  "input",
  "danger zone",
];

const settingKeys = [
  "smoothCaret",
  "caretStyle",
  "paceCaret",
  "repeatedPace",
  "paceCaretStyle",
  "timerStyle",
  "liveSpeedStyle",
  "liveAccStyle",
  "liveBurstStyle",
  "timerColor",
  "timerOpacity",
  "highlightMode",
  "typedEffect",
  "tapeMode",
  "tapeMargin",
  "smoothLineScroll",
  "showAllLines",
  "alwaysShowDecimalPlaces",
  "typingSpeedUnit",
  "startGraphsAtZero",
  "monkey",
  "maxLineWidth",
  "fontSize",
  "fontFamily",
  "keymapMode",
  "flipTestColors",
  "colorfulMode",
  "customBackground",
  "autoSwitchTheme",
  "randomTheme",
  "theme",
  "showKeyTips",
  "showOutOfFocusWarning",
  "capsLockWarning",
  "bgMusic",
  "soundVolume",
  "playSoundOnClick",
  "playSoundOnError",
  "playTimeWarning",
  "difficulty",
  "quickRestart",
  "repeatQuotes",
  "blindMode",
  "alwaysShowWordsHistory",
  "singleListCommandLine",
  "minSpeed",
  "minAcc",
  "minBurst",
  "britishEnglish",
  "language",
  "funbox",
  "customLayoutfluid",
  "customPolyglot",
  "freedomMode",
  "strictSpace",
  "oppositeShiftMode",
  "stopOnError",
  "deleteOnError",
  "confidenceMode",
  "quickEnd",
  "indicateTypos",
  "hideExtraLetters",
  "compositionDisplay",
  "lazyMode",
  "layout",
  "codeUnindentOnBackspace",
  "importExport",
  "cookies",
  "theRest",
  "resetSettings",
];

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
    setSettingsSearch("");
  });

  it("keeps every settings section and adds background music", () => {
    const { container } = render(() => <SettingsPage />);
    for (const title of sectionTitles) {
      expect(
        container.querySelector(`#${sectionDomId(title)}`),
        title,
      ).not.toBeNull();
    }
    const keys = [...container.querySelectorAll("[data-setting-key]")].map(
      (el) => el.getAttribute("data-setting-key"),
    );
    const visibleKeys = isConfigKeyHidden("showAverage")
      ? settingKeys
      : [...settingKeys, "showAverage"];
    for (const key of visibleKeys) {
      expect(keys, key).toContain(key);
    }
    expect(
      readFileSync(
        path.resolve(
          __dirname,
          "../../../../src/ts/components/pages/settings/SettingsPage.tsx",
        ),
        "utf8",
      ),
    ).toContain('key="showAverage"');
    expect(
      container.querySelector('[aria-label="background music volume"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("background music");
  });

  it("shows one tab panel at a time and switches with the keyboard", () => {
    const { container } = render(() => <SettingsPage />);
    const graphics = document.getElementById("settings-panel-graphics");
    const sound = document.getElementById("settings-panel-sound");
    const gameplay = document.getElementById("settings-panel-gameplay");
    expect(graphics).not.toHaveClass("hidden");
    expect(sound).toHaveClass("hidden");
    expect(gameplay).toHaveClass("hidden");
    expect(graphics).toHaveAttribute("role", "tabpanel");
    expect(graphics).toHaveAttribute(
      "aria-labelledby",
      "settings-tab-graphics",
    );

    const soundTab = document.getElementById("settings-tab-sound");
    if (soundTab === null) throw new Error("missing sound tab");
    fireEvent.click(soundTab);
    expect(sound).not.toHaveClass("hidden");
    expect(graphics).toHaveClass("hidden");
    expect(container.querySelector("#group_sound")).not.toBeNull();

    const gameplayTab = document.getElementById("settings-tab-gameplay");
    if (gameplayTab === null) throw new Error("missing gameplay tab");
    soundTab.focus();
    fireEvent.keyDown(soundTab, { key: "ArrowRight" });
    expect(gameplayTab).toHaveAttribute("aria-selected", "true");
    expect(gameplay).not.toHaveClass("hidden");
  });

  it("searches across tabs without a music prompt", () => {
    const { container } = render(() => <SettingsPage />);
    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="search settings"]',
    );
    if (input === null) throw new Error("missing search");
    fireEvent.input(input, { target: { value: "background music" } });
    const music = container.querySelector('[data-setting-key="bgMusic"]');
    expect(music).not.toHaveClass("hidden");
    expect(document.getElementById("settings-panel-sound")).not.toHaveClass(
      "hidden",
    );
    expect(
      container.querySelector('[role="tablist"]')?.parentElement,
    ).toHaveClass("hidden");
    expect(container.textContent).not.toMatch(/enable music|turn on music/i);
  });
});
