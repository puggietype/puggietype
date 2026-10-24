import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// restart() past its guards fades the test out: that's "a restart happened"
const ui = vi.hoisted(() => ({
  fadeOutTest: vi.fn(async () => new Promise<void>(() => undefined)),
}));
vi.mock("../../src/ts/test/test-ui", () => ({
  isMounted: () => true,
  fadeOutTest: ui.fadeOutTest,
}));
// FileStorage needs IndexedDB
vi.mock("../../src/ts/controllers/theme-controller", () => ({}));
vi.mock("../../src/ts/utils/quick-restart", () => ({
  canQuickRestart: vi.fn(() => true),
}));
const hotkeyCallbacks = vi.hoisted(() => [] as ((e: KeyboardEvent) => void)[]);
vi.mock("../../src/ts/input/hotkeys/utils", () => ({
  NoKey: "",
  createHotkey: (_key: unknown, cb: (e: KeyboardEvent) => void) =>
    hotkeyCallbacks.push(cb),
}));
vi.mock("../../src/ts/states/notifications", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showNoticeNotification: vi.fn(),
}));

const TestLogic = await import("../../src/ts/test/test-logic");
const Hooks = await import("../../src/ts/multiplayer/engine-hooks");
const { restartTestEvent } = await import("../../src/ts/events/test");
const { blockRaceTab } =
  await import("../../src/ts/input/hotkeys/quickrestart");
const { default: resultCommands } =
  await import("../../src/ts/commandline/lists/result-screen");
const { canQuickRestart } = await import("../../src/ts/utils/quick-restart");
const { showNoticeNotification } =
  await import("../../src/ts/states/notifications");
const { setResultVisible, setTestActive, setIsTestRestarting } =
  await import("../../src/ts/states/test");
const { setActivePage } = await import("../../src/ts/states/core");

const key = (k: string, shiftKey = false): KeyboardEvent =>
  new KeyboardEvent("keydown", { key: k, shiftKey, cancelable: true });

type Mode = "multiplayer" | "solo";
const MODES: Mode[] = ["multiplayer", "solo"];

describe("restart paths: blocked mid-race, unchanged solo", () => {
  beforeEach(() => {
    ui.fadeOutTest.mockClear();
    vi.mocked(showNoticeNotification).mockClear();
    vi.mocked(canQuickRestart).mockReturnValue(true);
    setTestActive(false);
    setResultVisible(false);
    setIsTestRestarting(false);
  });
  afterEach(() => {
    Hooks.setRaceRestartLocked(false);
    setTestActive(false);
    setResultVisible(false);
    setIsTestRestarting(false);
  });

  const enter = (mode: Mode): void =>
    Hooks.setRaceRestartLocked(mode === "multiplayer");
  const restarted = (mode: Mode): void => {
    if (mode === "multiplayer") expect(ui.fadeOutTest).not.toHaveBeenCalled();
    else expect(ui.fadeOutTest).toHaveBeenCalledTimes(1);
  };

  it.each(MODES)("restart() (%s)", async (mode) => {
    enter(mode);
    void TestLogic.restart();
    await Promise.resolve();
    restarted(mode);
  });

  it.each(MODES)(
    "restart event: logo, nav, modals, Tab > Enter (%s)",
    async (mode) => {
      enter(mode);
      restartTestEvent.dispatch();
      await Promise.resolve();
      restarted(mode);
    },
  );

  it.each(MODES)("restart button click (%s)", async (mode) => {
    enter(mode);
    TestLogic.onRestartButtonClick();
    await Promise.resolve();
    restarted(mode);
  });

  it.each(MODES)(
    "quick restart key (tab/esc/enter hotkeys) (%s)",
    async (mode) => {
      enter(mode);
      setActivePage("test");
      expect(hotkeyCallbacks.length).toBeGreaterThan(0);
      for (const cb of hotkeyCallbacks) {
        ui.fadeOutTest.mockClear();
        setIsTestRestarting(false);
        const e = key("Escape");
        cb(e);
        await Promise.resolve();
        expect(e.defaultPrevented).toBe(true);
        restarted(mode);
      }
    },
  );

  it.each(MODES)(
    "long-test quick restart notice only shows solo (%s)",
    async (mode) => {
      enter(mode);
      setTestActive(true);
      vi.mocked(canQuickRestart).mockReturnValue(false);
      const e = key("Tab");
      void TestLogic.restart({ isQuickRestart: true, event: e });
      await Promise.resolve();
      expect(e.defaultPrevented).toBe(true);
      if (mode === "multiplayer") {
        expect(showNoticeNotification).not.toHaveBeenCalled();
      } else {
        expect(showNoticeNotification).toHaveBeenCalledWith(
          expect.stringContaining("Quick restart disabled"),
          expect.anything(),
        );
      }
      expect(ui.fadeOutTest).not.toHaveBeenCalled();
    },
  );

  it.each(MODES)("Tab alone (%s)", (mode) => {
    enter(mode);
    const direct = key("Tab");
    blockRaceTab(direct);
    expect(direct.defaultPrevented).toBe(mode === "multiplayer");
    // registered on the document, ahead of focus movement
    const bubbled = key("Tab");
    document.body.dispatchEvent(bubbled);
    expect(bubbled.defaultPrevented).toBe(mode === "multiplayer");
    // other keys pass
    const other = key("a");
    blockRaceTab(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it.each(MODES)("commandline restart commands (%s)", (mode) => {
    enter(mode);
    setResultVisible(true);
    for (const id of ["nextTest", "repeatTest", "practiseWords"]) {
      const cmd = resultCommands.find((c) => c.id === id);
      expect(cmd?.available?.()).toBe(mode === "solo");
    }
  });
});
