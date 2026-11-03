import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  raceActive: false,
  room: undefined as { code: string } | undefined,
  page: "test",
}));

vi.mock("../../src/ts/multiplayer/engine-hooks", () => ({
  isRaceActive: () => state.raceActive,
}));
vi.mock("../../src/ts/multiplayer/race", () => ({
  leaveRoom: vi.fn(() => {
    state.raceActive = false;
    state.room = undefined;
  }),
}));
vi.mock("../../src/ts/multiplayer/store", () => ({
  room: () => state.room,
}));
vi.mock("../../src/ts/test/test-logic", () => ({ restart: vi.fn() }));
vi.mock("../../src/ts/controllers/page-controller", () => ({
  change: vi.fn(async () => undefined),
}));
vi.mock("../../src/ts/states/core", async (orig) => ({
  ...(await orig<object>()),
  getActivePage: () => state.page,
  isAuthenticated: () => false,
}));
vi.mock("../../src/ts/states/notifications", async (orig) => ({
  ...(await orig<object>()),
  showNoticeNotification: vi.fn(),
}));

const Race = await import("../../src/ts/multiplayer/race");
const TestLogic = await import("../../src/ts/test/test-logic");
const Pages = await import("../../src/ts/controllers/page-controller");
const Notifications = await import("../../src/ts/states/notifications");
const { onPopState } =
  await import("../../src/ts/controllers/route-controller");

describe("browser Back during a race (LR-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.raceActive = true;
    state.room = { code: "ABCD2345" };
    state.page = "test";
  });
  afterEach(() => history.replaceState(null, "", "/"));

  it("Back to the lobby entry: sends the leave, shows home with a solo test", async () => {
    // the race runs on "/", Back moves the URL to the lobby's /r/CODE
    history.replaceState(null, "", "/r/ABCD2345");
    await onPopState();
    expect(Race.leaveRoom).toHaveBeenCalledTimes(1);
    expect(location.pathname).toBe("/");
    expect(TestLogic.restart).toHaveBeenCalledTimes(1);
    expect(Notifications.showNoticeNotification).toHaveBeenCalledWith(
      "You left the race.",
    );
    // never the race page: that would rejoin the room as a sitter
    expect(Pages.change).not.toHaveBeenCalledWith("race", expect.anything());
  });

  it("Back to an entry on '/' itself still leaves (no stale race at home)", async () => {
    history.replaceState(null, "", "/");
    await onPopState();
    expect(Race.leaveRoom).toHaveBeenCalledTimes(1);
    expect(location.pathname).toBe("/");
    expect(TestLogic.restart).toHaveBeenCalledTimes(1);
  });

  it("before the test page mounts (countdown): leaves and routes home", async () => {
    state.page = "race";
    history.replaceState(null, "", "/r/ABCD2345");
    await onPopState();
    expect(Race.leaveRoom).toHaveBeenCalledTimes(1);
    expect(location.pathname).toBe("/");
    expect(Pages.change).toHaveBeenCalledWith("test", expect.anything());
  });

  it("no race: Back just routes, nothing is left", async () => {
    state.raceActive = false;
    history.replaceState(null, "", "/r/ABCD2345");
    await onPopState();
    expect(Race.leaveRoom).not.toHaveBeenCalled();
    expect(location.pathname).toBe("/r/ABCD2345");
    expect(Pages.change).toHaveBeenCalledWith("race", expect.anything());
  });
});
