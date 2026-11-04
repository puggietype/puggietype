import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import type { SettingsTabId } from "../../../../src/ts/components/pages/settings/settings-tabs";

import { SettingsTabs } from "../../../../src/ts/components/pages/settings/SettingsTabs";

describe("SettingsTabs", () => {
  afterEach(() => {
    cleanup();
  });

  function mount(initial: SettingsTabId = "graphics"): {
    tab: () => SettingsTabId;
    container: HTMLElement;
  } {
    const [tab, setTab] = createSignal<SettingsTabId>(initial);
    const view = render(() => <SettingsTabs tab={tab()} onChange={setTab} />);
    return { tab, container: view.container };
  }

  it("exposes a tablist with roving tabindex", () => {
    const { container } = mount();
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(3);
    const list = container.querySelector('[role="tablist"]');
    expect(list).toHaveAttribute("aria-label", "Settings categories");
    expect(list).toHaveAttribute("aria-orientation", "horizontal");
    expect(document.getElementById("settings-tab-graphics")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.getElementById("settings-tab-graphics")).toHaveAttribute(
      "aria-controls",
      "settings-panel-graphics",
    );
    expect(document.getElementById("settings-tab-graphics")).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(document.getElementById("settings-tab-sound")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(document.getElementById("settings-tab-sound")).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(document.getElementById("settings-tab-gameplay")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("selects the next tab from the keyboard and wraps", () => {
    const { tab, container } = mount();
    const graphics = container.querySelector<HTMLButtonElement>(
      "#settings-tab-graphics",
    );
    const sound = container.querySelector<HTMLButtonElement>(
      "#settings-tab-sound",
    );
    const gameplay = container.querySelector<HTMLButtonElement>(
      "#settings-tab-gameplay",
    );
    if (graphics === null || sound === null || gameplay === null) {
      throw new Error("missing tab");
    }
    graphics.focus();
    fireEvent.keyDown(graphics, { key: "ArrowRight" });
    expect(tab()).toBe("sound");
    expect(sound).toHaveFocus();
    expect(sound).toHaveAttribute("aria-selected", "true");
    expect(graphics).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(sound, { key: "End" });
    expect(tab()).toBe("gameplay");
    expect(gameplay).toHaveFocus();
    fireEvent.keyDown(gameplay, { key: "ArrowRight" });
    expect(tab()).toBe("graphics");
    expect(graphics).toHaveFocus();
    fireEvent.keyDown(graphics, { key: "ArrowLeft" });
    expect(tab()).toBe("gameplay");
    fireEvent.keyDown(gameplay, { key: "Home" });
    expect(tab()).toBe("graphics");
  });

  it("selects a tab on click", () => {
    const { tab, container } = mount();
    const sound = container.querySelector("#settings-tab-sound");
    if (sound === null) throw new Error("missing sound tab");
    fireEvent.click(sound);
    expect(tab()).toBe("sound");
    expect(sound).toHaveAttribute("aria-selected", "true");
  });
});
