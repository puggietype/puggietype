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
  it("adds display to Graphics and music to Sound; music shows off", async () => {
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
    expect(pressed?.textContent).toBe("off");
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
    vi.stubGlobal(
      "matchMedia",
      (q: string) => ({ matches: false, media: q }) as MediaQueryList,
    );
    const { applyReducedMotion } =
      await import("../../src/ts/steam/game-settings");
    applyReducedMotion(true);
    expect(window.matchMedia("(prefers-reduced-motion)").matches).toBe(true);
    expect(window.matchMedia("(min-width: 1px)").matches).toBe(false);
    applyReducedMotion(false);
    expect(window.matchMedia("(prefers-reduced-motion)").matches).toBe(false);
  });

  it("the fullscreen button uses the desktop shell", async () => {
    const { SteamGraphicsSettings } =
      await import("../../src/ts/steam/SteamGraphicsSettings");
    const root = render(() => <SteamGraphicsSettings />).container;
    fireEvent.click(root.querySelector("#steam-fullscreen") as HTMLElement);
    const bridge = (
      globalThis as unknown as {
        puggieDesktop: { fullscreen: { toggle: ReturnType<typeof vi.fn> } };
      }
    ).puggieDesktop;
    expect(bridge.fullscreen.toggle).toHaveBeenCalledTimes(1);
  });
});
