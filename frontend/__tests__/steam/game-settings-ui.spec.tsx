import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ts/utils/json-data", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/ts/utils/json-data")>();
  return {
    ...actual,
    getLayout: async (): Promise<Record<string, never>> => ({}),
  };
});
vi.mock("../../src/ts/utils/file-storage", () => ({
  default: {
    track: (): number => 0,
    hasFile: async (): Promise<boolean> => false,
    deleteFile: async (): Promise<void> => undefined,
  },
}));

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("__PLATFORM__", "steam");
  vi.stubGlobal("puggieDesktop", {
    version: 1,
    fullscreen: { isFullscreen: () => false, toggle: vi.fn() },
    storage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("zoom");
});

function clickText(root: HTMLElement, testId: string, text: string): void {
  const group = root.querySelector(`[data-testid="${testId}"]`);
  const btn = [...(group?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === text,
  );
  if (!btn) throw new Error(`missing ${testId} ${text}`);
  fireEvent.click(btn);
}

type Saved = {
  music: { enabled: boolean; track: string; whileTyping: string };
  uiScale: number;
};
const saved = (): Saved =>
  JSON.parse(store.get("steamGameSettings") ?? "null") as Saved;

describe("steam settings page", () => {
  it("adds display to Graphics and music to Sound; music shows on", async () => {
    const { SettingsPage } =
      await import("../../src/ts/components/pages/settings/SteamSettingsPage");
    render(() => <SettingsPage />);
    await waitFor(() =>
      expect(
        document.querySelector('[data-testid="steam-sound"]'),
      ).not.toBeNull(),
    );
    expect(
      document.querySelector(
        "#settings-panel-graphics [data-testid=steam-graphics]",
      ),
    ).not.toBeNull();
    expect(
      document.querySelector("#settings-panel-sound [data-testid=steam-sound]"),
    ).not.toBeNull();
    const buttons = [
      ...document.querySelectorAll(
        '[data-testid="steam-music-enabled"] button',
      ),
    ];
    expect(buttons.map((b) => b.textContent)).toEqual(["off", "on"]);
    const pressed = buttons.find(
      (b) => b.getAttribute("aria-pressed") === "true",
    );
    expect(pressed?.textContent).toBe("on");
  }, 30_000);

  it("persists music, track, while-typing and UI scale choices", async () => {
    const { SteamSoundSettings } =
      await import("../../src/ts/steam/SteamSoundSettings");
    const { SteamGraphicsSettings } =
      await import("../../src/ts/steam/SteamGraphicsSettings");
    const root = render(() => (
      <>
        <SteamGraphicsSettings />
        <SteamSoundSettings />
      </>
    )).container;
    clickText(root, "steam-music-enabled", "on");
    clickText(root, "steam-music-track", "Sherwood");
    clickText(root, "steam-music-while-typing", "lower");
    clickText(root, "steam-ui-scale", "125%");
    // QA PR30-SCALE-ORPHAN: 6 scales in two even rows of 3
    const scale = root.querySelector('[data-testid="steam-ui-scale"]');
    expect(scale?.getAttribute("data-steam-cols")).toBe("3");
    expect(scale?.children).toHaveLength(6);
    expect(
      root
        .querySelector('[data-testid="steam-fps-cap"]')
        ?.getAttribute("data-steam-cols"),
    ).toBe("3");
    expect(saved().music).toMatchObject({
      enabled: true,
      track: "sherwood",
      whileTyping: "lower",
    });
    expect(saved().uiScale).toBe(1.25);
    const { installSteamGameSettings } =
      await import("../../src/ts/steam/game-settings");
    installSteamGameSettings();
    expect(document.documentElement.dataset["uiScale"]).toBe("1.25");
  });

  it("reduced motion makes (prefers-reduced-motion) match", async () => {
    // like the real MediaQueryList: methods throw unless called on it
    const made = new Set<object>();
    const guard = function (this: unknown): void {
      if (!made.has(this as object)) throw new TypeError("Illegal invocation");
    };
    vi.stubGlobal("matchMedia", (q: string) => {
      const m = {
        matches: false,
        media: q,
        onchange: null,
        addEventListener: guard,
        removeEventListener: guard,
        addListener: guard,
        removeListener: guard,
        dispatchEvent: guard,
      };
      made.add(m);
      return m as unknown as MediaQueryList;
    });
    const { applyReducedMotion } =
      await import("../../src/ts/steam/game-settings");
    applyReducedMotion(true);
    const forced = window.matchMedia("(prefers-reduced-motion: reduce)");
    expect(forced.matches).toBe(true);
    // regression: the test page listens for changes; this must not throw
    expect(() => {
      forced.addEventListener("change", () => undefined);
      forced.removeEventListener("change", () => undefined);
    }).not.toThrow();
    expect(window.matchMedia("(prefers-reduced-motion)").matches).toBe(true);
    expect(window.matchMedia("(min-width: 1px)").matches).toBe(false);
    applyReducedMotion(false);
    expect(window.matchMedia("(prefers-reduced-motion)").matches).toBe(false);
  });

  it("display mode and resolution go to the desktop shell; VSync asks for a restart", async () => {
    const apply = vi.fn((d: { vsync: boolean }) => ({
      restartRequired: !d.vsync,
    }));
    (
      globalThis as unknown as { puggieDesktop: Record<string, unknown> }
    ).puggieDesktop["display"] = { apply };
    const { installSteamGameSettings } =
      await import("../../src/ts/steam/game-settings");
    installSteamGameSettings();
    const { SteamGraphicsSettings } =
      await import("../../src/ts/steam/SteamGraphicsSettings");
    const root = render(() => <SteamGraphicsSettings />).container;
    clickText(root, "steam-display-mode", "fullscreen");
    expect(apply).toHaveBeenLastCalledWith({
      displayMode: "fullscreen",
      resolution: "native",
      vsync: true,
    });
    clickText(root, "steam-display-mode", "windowed");
    clickText(root, "steam-resolution", "1600×900");
    expect(apply).toHaveBeenLastCalledWith({
      displayMode: "windowed",
      resolution: "1600x900",
      vsync: true,
    });
    expect(
      root.querySelector('[data-testid="steam-restart-required"]'),
    ).toBeNull();
    clickText(root, "steam-vsync", "off");
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({ vsync: false }),
    );
    expect(
      root.querySelector('[data-testid="steam-restart-required"]')?.textContent,
    ).toBe("Restart PuggieType to apply all display changes.");
    expect(saved()).toMatchObject({
      displayMode: "windowed",
      resolution: "1600x900",
      vsync: false,
    });
  });

  it("frame rate cap, animation quality and brightness persist and apply", async () => {
    const { installSteamGameSettings } =
      await import("../../src/ts/steam/game-settings");
    installSteamGameSettings();
    const { SteamGraphicsSettings } =
      await import("../../src/ts/steam/SteamGraphicsSettings");
    const root = render(() => <SteamGraphicsSettings />).container;
    const html = document.documentElement;
    clickText(root, "steam-fps-cap", "30");
    expect(html.dataset["fpsCap"]).toBe("30");
    clickText(root, "steam-fps-cap", "unlimited");
    expect(html.dataset["fpsCap"]).toBe("0");
    clickText(root, "steam-animation", "off");
    expect(html.classList.contains("anim-off")).toBe(true);
    expect(html.classList.contains("reduce-motion")).toBe(true);
    clickText(root, "steam-animation", "reduced");
    expect(html.classList.contains("anim-off")).toBe(false);
    expect(html.classList.contains("reduce-motion")).toBe(true);
    const range = root.querySelector<HTMLInputElement>(
      '[data-testid="steam-brightness"] input[type=range]',
    );
    expect(range?.min).toBe("0.5");
    expect(range?.max).toBe("1.5");
    fireEvent.input(range as HTMLInputElement, { target: { value: "1.2" } });
    expect(html.dataset["brightness"]).toBe("1.2");
    expect(html.style.getPropertyValue("filter")).toBe("brightness(1.2)");
    expect(saved()).toMatchObject({
      fpsCap: 0,
      animation: "reduced",
      brightness: 1.2,
    });
  });

  it("reset to defaults restores graphics only", async () => {
    const { installSteamGameSettings } =
      await import("../../src/ts/steam/game-settings");
    installSteamGameSettings();
    const { SteamGraphicsSettings } =
      await import("../../src/ts/steam/SteamGraphicsSettings");
    const { SteamSoundSettings } =
      await import("../../src/ts/steam/SteamSoundSettings");
    const root = render(() => (
      <>
        <SteamGraphicsSettings />
        <SteamSoundSettings />
      </>
    )).container;
    clickText(root, "steam-ui-scale", "150%");
    clickText(root, "steam-fps-cap", "144");
    clickText(root, "steam-animation", "off");
    clickText(root, "steam-mute", "on");
    fireEvent.click(root.querySelector("#steam-graphics-reset") as HTMLElement);
    expect(saved()).toMatchObject({
      uiScale: 1,
      fpsCap: 60,
      animation: "full",
      brightness: 1,
      displayMode: "windowed",
      resolution: "native",
      vsync: true,
      muted: true,
    });
    expect(document.documentElement.dataset["uiScale"]).toBe("1");
  });

  it("sound effects volume and mute persist and set the Web Audio gain", async () => {
    const gs = await import("../../src/ts/steam/game-settings");
    const { SteamSoundSettings } =
      await import("../../src/ts/steam/SteamSoundSettings");
    const root = render(() => <SteamSoundSettings />).container;
    clickText(root, "steam-mute", "off");
    const range = [
      ...root.querySelectorAll<HTMLInputElement>("input[type=range]"),
    ].find((i) => i.getAttribute("aria-label") === "sound effects volume");
    fireEvent.input(range as HTMLInputElement, { target: { value: "0.5" } });
    expect(saved()).toMatchObject({ sfxVolume: 0.5 });
    expect(gs.sfxGain(gs.getSteamSettings())).toBeCloseTo(0.5);
    clickText(root, "steam-mute", "on");
    expect(saved()).toMatchObject({ muted: true, sfxVolume: 0.5 });
    expect(gs.sfxGain(gs.getSteamSettings())).toBe(0);
    clickText(root, "steam-mute", "off");
    expect(
      gs.sfxGain({ ...gs.getSteamSettings(), masterVolume: 0.5 }),
    ).toBeCloseTo(0.25);
  });

  it("every control is a native button or range input (keyboard reachable)", async () => {
    const { SteamGraphicsSettings } =
      await import("../../src/ts/steam/SteamGraphicsSettings");
    const { SteamSoundSettings } =
      await import("../../src/ts/steam/SteamSoundSettings");
    const root = render(() => (
      <>
        <SteamGraphicsSettings />
        <SteamSoundSettings />
      </>
    )).container;
    const { focusables } = await import("../../src/ts/steam/gamepad-nav");
    // jsdom has no layout; everything here is rendered
    const proto = HTMLElement.prototype as unknown as {
      checkVisibility?: () => boolean;
    };
    proto.checkVisibility = (): boolean => true;
    const list = focusables(root);
    delete proto.checkVisibility;
    expect(list.length).toBeGreaterThan(25);
    for (const el of list) {
      expect(["BUTTON", "INPUT", "A"]).toContain(el.tagName);
      expect(el.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });
});
