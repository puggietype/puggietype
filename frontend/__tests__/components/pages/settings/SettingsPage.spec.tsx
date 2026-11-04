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
import { BG_MUSIC_SRC } from "../../../../src/ts/controllers/background-music";
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
  });

  it("hides background music controls while no track is bundled", () => {
    expect(BG_MUSIC_SRC).toBeNull();
    const { container } = render(() => <SettingsPage />);
    const soundTab = document.getElementById("settings-tab-sound");
    if (soundTab === null) throw new Error("missing sound tab");
    fireEvent.click(soundTab);
    expect(container.querySelector('[data-setting-key="bgMusic"]')).toBeNull();
    expect(
      container.querySelector('[aria-label="background music volume"]'),
    ).toBeNull();
    expect(container.textContent?.toLowerCase()).not.toContain(
      "background music",
    );
    expect(container.textContent?.toLowerCase()).not.toContain(
      "loop a quiet track",
    );
    expect(container.textContent?.toLowerCase()).not.toContain("coming soon");
    expect(
      container.querySelector('[data-setting-key="soundVolume"]'),
    ).not.toBeNull();

    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="search settings"]',
    );
    if (input === null) throw new Error("missing search");
    fireEvent.input(input, { target: { value: "quiet track" } });
    expect(container.querySelector('[data-setting-key="bgMusic"]')).toBeNull();
    expect(container.textContent?.toLowerCase()).not.toContain(
      "loop a quiet track",
    );
    fireEvent.input(input, { target: { value: "background music" } });
    expect(
      container.querySelector('[aria-label="background music volume"]'),
    ).toBeNull();
    expect(container.textContent?.toLowerCase()).not.toContain(
      "background music",
    );
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
    fireEvent.input(input, { target: { value: "sound volume" } });
    const volume = container.querySelector('[data-setting-key="soundVolume"]');
    expect(volume).not.toHaveClass("hidden");
    expect(container.querySelector('[data-setting-key="bgMusic"]')).toBeNull();
    expect(document.getElementById("settings-panel-sound")).not.toHaveClass(
      "hidden",
    );
    expect(
      container.querySelector('[role="tablist"]')?.parentElement,
    ).toHaveClass("hidden");
    for (const id of ["graphics", "sound", "gameplay"]) {
      const panel = document.getElementById(`settings-panel-${id}`);
      expect(panel, id).not.toHaveAttribute("role");
      expect(panel, id).not.toHaveAttribute("aria-labelledby");
    }
    expect(container.textContent).not.toMatch(/enable music|turn on music/i);

    fireEvent.input(input, { target: { value: "" } });
    expect(document.getElementById("settings-panel-graphics")).toHaveAttribute(
      "role",
      "tabpanel",
    );
    expect(document.getElementById("settings-panel-graphics")).toHaveAttribute(
      "aria-labelledby",
      "settings-tab-graphics",
    );
    expect(document.getElementById("settings-panel-sound")).toHaveAttribute(
      "role",
      "tabpanel",
    );
  });
});
