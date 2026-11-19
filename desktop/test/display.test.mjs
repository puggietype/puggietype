import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_DISPLAY,
  applyWindowState,
  needsRestart,
  parseDisplay,
  vsyncSwitches,
  windowOptionsFor,
  windowState,
} from "../src/display.mjs";

const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 };

describe("display settings", () => {
  it("parses the renderer's stored JSON; bad values fall back", () => {
    assert.deepEqual(parseDisplay(null), DEFAULT_DISPLAY);
    assert.deepEqual(parseDisplay("not json"), DEFAULT_DISPLAY);
    assert.deepEqual(
      parseDisplay(
        JSON.stringify({
          displayMode: "fullscreen",
          resolution: "1600x900",
          vsync: false,
        }),
      ),
      { displayMode: "fullscreen", resolution: "1600x900", vsync: false },
    );
    assert.deepEqual(
      parseDisplay({ displayMode: "huge", resolution: "99x99", vsync: "no" }),
      DEFAULT_DISPLAY,
    );
  });

  it("VSync off adds the Chromium switches (read at launch)", () => {
    assert.deepEqual(vsyncSwitches({ vsync: true }), []);
    assert.deepEqual(vsyncSwitches({ vsync: false }), [
      "disable-gpu-vsync",
      "disable-frame-rate-limit",
    ]);
  });

  it("window state per mode and resolution", () => {
    assert.deepEqual(
      windowState({ displayMode: "fullscreen", resolution: "native" }, SCREEN),
      {
        fullscreen: true,
        frameless: false,
      },
    );
    assert.deepEqual(
      windowState(
        { displayMode: "borderless", resolution: "1280x720" },
        SCREEN,
      ),
      {
        fullscreen: false,
        frameless: true,
        bounds: SCREEN,
      },
    );
    assert.deepEqual(
      windowState({ displayMode: "windowed", resolution: "native" }, SCREEN)
        .size,
      {
        width: 1920,
        height: 1080,
      },
    );
    assert.deepEqual(
      windowState({ displayMode: "windowed", resolution: "2560x1440" }, SCREEN)
        .size,
      {
        width: 1920,
        height: 1080,
      },
    );
    assert.deepEqual(
      windowState({ displayMode: "windowed", resolution: "1280x720" }, SCREEN)
        .size,
      {
        width: 1280,
        height: 720,
      },
    );
  });

  it("borderless is a frameless window; changing it or VSync needs a restart", () => {
    assert.deepEqual(windowOptionsFor({ displayMode: "borderless" }), {
      frame: false,
    });
    assert.deepEqual(windowOptionsFor({ displayMode: "windowed" }), {});
    const base = { displayMode: "windowed", resolution: "native", vsync: true };
    assert.equal(
      needsRestart(base, { ...base, displayMode: "fullscreen" }),
      false,
    );
    assert.equal(
      needsRestart(base, { ...base, resolution: "1280x720" }),
      false,
    );
    assert.equal(
      needsRestart(base, { ...base, displayMode: "borderless" }),
      true,
    );
    assert.equal(needsRestart(base, { ...base, vsync: false }), true);
  });

  it("applies through the BrowserWindow API", () => {
    const calls = [];
    let fs = false;
    const win = {
      isFullScreen: () => fs,
      setFullScreen: (v) => {
        fs = v;
        calls.push(["fullscreen", v]);
      },
      setSize: (w, h) => calls.push(["size", w, h]),
      setBounds: (b) => calls.push(["bounds", b]),
      center: () => calls.push(["center"]),
    };
    applyWindowState(win, windowState({ displayMode: "fullscreen" }, SCREEN));
    applyWindowState(
      win,
      windowState({ displayMode: "windowed", resolution: "1600x900" }, SCREEN),
    );
    assert.deepEqual(calls, [
      ["fullscreen", true],
      ["fullscreen", false],
      ["size", 1600, 900],
      ["center"],
    ]);
  });
});

describe("main wiring", () => {
  it("reads the display at launch, applies VSync switches and exposes display:apply to trusted frames", async () => {
    const { readFileSync } = await import("node:fs");
    const main = readFileSync(
      new URL("../src/main.mjs", import.meta.url),
      "utf8",
    );
    const preload = readFileSync(
      new URL("../src/preload.cjs", import.meta.url),
      "utf8",
    );
    assert.match(
      main,
      /vsyncSwitches\(startDisplay\)\) app\.commandLine\.appendSwitch/,
    );
    assert.match(main, /windowOptionsFor\(startDisplay\)/);
    assert.match(
      main,
      /ipcMain\.on\("display:apply", \(event, json\) => \{[\s\S]*?trusted\(event\) \? fromWindow\(event\) : null;/,
    );
    assert.match(
      preload,
      /sendSync\("display:apply", JSON\.stringify\(settings\)\)/,
    );
  });
});
