import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  installChunkReload,
  isChunkLoadError,
  reloadOnce,
  reloadedRecently,
  RELOAD_KEY,
} from "../../src/ts/utils/chunk-reload";

describe("chunk-reload", () => {
  beforeEach(() => sessionStorage.clear());

  it("detects chunk load errors across browsers", () => {
    expect(
      isChunkLoadError(
        new TypeError("Failed to fetch dynamically imported module: /js/a.js"),
      ),
    ).toBe(true);
    expect(
      isChunkLoadError(new Error("Importing a module script failed.")),
    ).toBe(true);
    expect(isChunkLoadError("error loading dynamically imported module")).toBe(
      true,
    );
    expect(isChunkLoadError(new Error("boom"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it("reloads once, then not again within a minute", () => {
    const reload = vi.fn();
    expect(reloadOnce(reload)).toBe(true);
    expect(reloadOnce(reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("allows another reload after the window", () => {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now() - 61_000));
    expect(reloadedRecently()).toBe(false);
  });

  it("never reloads when storage throws", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: (): never => {
        throw new Error("blocked");
      },
    });
    const reload = vi.fn();
    expect(reloadOnce(reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("vite:preloadError reloads once and is prevented", () => {
    const target = new EventTarget() as unknown as Window;
    const reload = vi.fn();
    installChunkReload(target, reload);
    const e1 = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(e1);
    const e2 = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(e2);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(e1.defaultPrevented).toBe(true);
    expect(e2.defaultPrevented).toBe(false);
  });

  it("unhandled dynamic import failure reloads once; other rejections don't", () => {
    const target = new EventTarget() as unknown as Window;
    const reload = vi.fn();
    installChunkReload(target, reload);
    const rej = (reason: unknown): Event =>
      Object.assign(new Event("unhandledrejection"), { reason });
    target.dispatchEvent(rej(new Error("boom")));
    expect(reload).not.toHaveBeenCalled();
    target.dispatchEvent(
      rej(new TypeError("Failed to fetch dynamically imported module: x")),
    );
    target.dispatchEvent(
      rej(new TypeError("Failed to fetch dynamically imported module: y")),
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
