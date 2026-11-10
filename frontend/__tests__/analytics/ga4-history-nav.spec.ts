import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  ga4MeasurementId: "G-TEST1234",
}));

vi.mock("virtual:env-config", () => ({
  envConfig: env,
}));

vi.mock("../../src/ts/controllers/page-controller", () => ({
  change: vi.fn(async () => undefined),
  isNavigating: () => false,
}));
vi.mock("../../src/ts/test/test-logic", () => ({ restart: vi.fn() }));
vi.mock("../../src/ts/multiplayer/race", () => ({ leaveRoom: vi.fn() }));
vi.mock("../../src/ts/multiplayer/store", () => ({ room: () => undefined }));
vi.mock("../../src/ts/multiplayer/engine-hooks", () => ({
  isRaceActive: () => false,
}));

import * as Pages from "../../src/ts/controllers/page-controller";
import {
  navigate,
  onPopState,
} from "../../src/ts/controllers/route-controller";
import { loadGa4 } from "../../src/ts/analytics/ga4";

describe("history lock still lets the app navigate", () => {
  afterEach(() => {
    history.replaceState(null, "", "/");
    vi.clearAllMocks();
  });

  it("pushState, replaceState, and Back still move the URL after GA loads", async () => {
    loadGa4("G-TEST1234");
    history.pushState(null, "", "/settings");
    expect(location.pathname).toBe("/settings");
    history.pushState(null, "", "/privacy");
    expect(location.pathname).toBe("/privacy");
    history.replaceState(null, "", "/guide/about");
    expect(location.pathname).toBe("/guide/about");

    let popped = 0;
    const onPop = (): void => {
      popped += 1;
    };
    window.addEventListener("popstate", onPop);
    history.back();
    window.removeEventListener("popstate", onPop);
    expect(popped).toBe(1);
    expect(location.pathname).toBe("/settings");
    await onPopState();
    expect(Pages.change).toHaveBeenCalledWith("settings", expect.anything());
  });

  it("in-app /settings goes through the router, and /privacy and /guide links do not", async () => {
    loadGa4("G-TEST1234");
    await navigate("/settings");
    expect(location.pathname).toBe("/settings");
    expect(Pages.change).toHaveBeenCalledWith("settings", expect.anything());

    history.pushState(null, "", "/");
    await onPopState();
    expect(location.pathname).toBe("/");
    expect(Pages.change).toHaveBeenCalledWith("test", expect.anything());

    for (const href of ["/privacy", "/guide/about", "/guide/typing-tips"]) {
      const link = document.createElement("a");
      link.href = href;
      document.body.append(link);
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(event);
      expect(event.defaultPrevented, href).toBe(false);
      expect(location.pathname, href).toBe(
        new URL(href, location.origin).pathname,
      );
      link.remove();
    }
  });
});
