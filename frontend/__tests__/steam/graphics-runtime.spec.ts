import { afterEach, describe, expect, it, vi } from "vitest";

import { actionOf, focusables, perform } from "../../src/ts/steam/gamepad-nav";
import {
  applyFrameCap,
  frameAllowed,
  installFrameCap,
} from "../../src/ts/steam/game-settings";
import { parseResolution } from "../../src/ts/steam/settings-store";

afterEach(() => {
  document.body.innerHTML = "";
  applyFrameCap(0);
});

describe("frame rate cap (requestAnimationFrame throttle)", () => {
  it("at 30 fps runs every other 60 Hz frame; unlimited runs all", () => {
    applyFrameCap(30);
    const ran = [0, 16.7, 33.4, 50.1, 66.8, 83.5].filter((t) =>
      frameAllowed(1000 + t),
    );
    expect(ran).toHaveLength(3);
    applyFrameCap(0);
    expect([1, 2, 3].every((t) => frameAllowed(2000 + t))).toBe(true);
  });

  it("at 60 fps on a 60 Hz display runs every frame", () => {
    applyFrameCap(60);
    const ran = [0, 16.67, 33.33, 50, 66.67].filter((t) =>
      frameAllowed(5000 + t),
    );
    expect(ran).toHaveLength(5);
  });

  it("several callbacks in one frame all run", () => {
    applyFrameCap(30);
    expect(frameAllowed(9000)).toBe(true);
    expect(frameAllowed(9000)).toBe(true);
  });

  it("throttles requestAnimationFrame and keeps cancel working", () => {
    const queue: ((t: number) => void)[] = [];
    const target = {
      requestAnimationFrame: vi.fn((cb: FrameRequestCallback) => {
        queue.push(cb);
        return queue.length;
      }),
      cancelAnimationFrame: vi.fn(),
    };
    installFrameCap(target);
    applyFrameCap(30);
    const cb = vi.fn();
    target.requestAnimationFrame(cb);
    let t = 20000;
    while (cb.mock.calls.length === 0 && queue.length < 10) {
      queue.shift()?.((t += 16.7));
    }
    expect(cb).toHaveBeenCalledTimes(1);
    const cb2 = vi.fn();
    const id = target.requestAnimationFrame(cb2);
    target.cancelAnimationFrame(id);
    expect(target.cancelAnimationFrame).toBeDefined();
  });
});

describe("resolution", () => {
  it("parses windowed sizes; native is the screen", () => {
    expect(parseResolution("1920x1080")).toEqual({ width: 1920, height: 1080 });
    expect(parseResolution("native")).toBeNull();
  });
});

describe("controller navigation", () => {
  const pad = (
    pressed: number[] = [],
    axes: number[] = [0, 0],
  ): Parameters<typeof actionOf>[0] => ({
    buttons: Array.from({ length: 16 }, (_, i) => ({
      pressed: pressed.includes(i),
    })),
    axes,
  });

  it("maps the standard layout", () => {
    expect(actionOf(pad())).toBeNull();
    expect(actionOf(pad([0]))).toBe("press");
    expect(actionOf(pad([1]))).toBe("back");
    expect(actionOf(pad([12]))).toBe("prev");
    expect(actionOf(pad([13]))).toBe("next");
    expect(actionOf(pad([14]))).toBe("left");
    expect(actionOf(pad([15]))).toBe("right");
    expect(actionOf(pad([], [0, 0.9]))).toBe("next");
    expect(actionOf(pad([], [-0.9, 0]))).toBe("left");
  });

  it("moves focus, steps sliders and presses buttons", () => {
    document.body.innerHTML = `
      <button id="a">a</button>
      <input id="r" type="range" min="0" max="1" step="0.1" value="0.5" />
      <button id="b">b</button>
      <button id="hidden" hidden>x</button>`;
    expect(focusables().map((e) => e.id)).toEqual(["a", "r", "b"]);
    perform("next");
    expect(document.activeElement?.id).toBe("a");
    perform("next");
    expect(document.activeElement?.id).toBe("r");
    const r = document.getElementById("r") as HTMLInputElement;
    const onInput = vi.fn();
    r.addEventListener("input", onInput);
    perform("right");
    expect(r.value).toBe("0.6");
    expect(onInput).toHaveBeenCalled();
    perform("next");
    const b = document.getElementById("b") as HTMLButtonElement;
    const onClick = vi.fn();
    b.addEventListener("click", onClick);
    perform("press");
    expect(onClick).toHaveBeenCalledTimes(1);
    perform("next");
    expect(document.activeElement?.id).toBe("a");
    perform("prev");
    expect(document.activeElement?.id).toBe("b");
    perform("back");
    expect(document.activeElement).toBe(document.body);
  });
});
