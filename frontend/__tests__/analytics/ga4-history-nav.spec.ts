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
    vi.restoreAllMocks();
  });

  it("pushState, replaceState, and Back still move the URL after GA loads", async () => {
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => node);
    let early = 0;
    const onEarly = (): void => {
      early += 1;
    };
    window.addEventListener("popstate", onEarly);
    loadGa4("G-TEST1234");
    history.pushState(null, "", "/settings");
    expect(location.pathname).toBe("/settings");
    history.pushState(null, "", "/privacy");
    expect(location.pathname).toBe("/privacy");
    history.replaceState(null, "", "/guide/about");
    expect(location.pathname).toBe("/guide/about");

    let late = 0;
    const onLate = (): void => {
      late += 1;
    };
    window.addEventListener("popstate", onLate);
    history.back();
    window.removeEventListener("popstate", onLate);
    window.removeEventListener("popstate", onEarly);
    // Listeners registered before and after loadGa4 both still run.
    expect(early).toBe(1);
    expect(late).toBe(1);
    expect(location.pathname).toBe("/settings");
    await onPopState();
    expect(Pages.change).toHaveBeenCalledWith("settings", expect.anything());
  });

  it("swallows only a popstate listener registered as if by gtag.js", () => {
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => node);
    loadGa4("G-TEST1234");
    const gtagScript = document.createElement("script");
    gtagScript.src = "https://www.googletagmanager.com/gtag/js?id=G-TEST1234";
    const previous = Object.getOwnPropertyDescriptor(document, "currentScript");
    Object.defineProperty(document, "currentScript", {
      configurable: true,
      get: () => gtagScript,
    });
    let fromGtag = 0;
    const onGtag = (): void => {
      fromGtag += 1;
    };
    window.addEventListener("popstate", onGtag);
    window.onpopstate = onGtag;
    if (previous === undefined) {
      Reflect.deleteProperty(document, "currentScript");
    } else {
      Object.defineProperty(document, "currentScript", previous);
    }
    let fromApp = 0;
    const onApp = (): void => {
      fromApp += 1;
    };
    window.addEventListener("popstate", onApp);
    history.pushState(null, "", "/settings");
    history.pushState(null, "", "/about");
    history.back();
    window.removeEventListener("popstate", onGtag);
    window.removeEventListener("popstate", onApp);
    window.onpopstate = null;
    expect(fromGtag).toBe(0);
    expect(fromApp).toBe(1);
  });

  it("normalises a leading double slash so pushState does not throw", async () => {
    await expect(navigate("//r//X")).resolves.toBeUndefined();
    expect(location.pathname).toBe("/r//X");
    expect(Pages.change).toHaveBeenCalledWith(
      "race",
      expect.objectContaining({ params: { code: "/X" } }),
    );
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
