import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

class FakeGain {
  gain = { value: 1 };
  target: unknown;
  connect(t: unknown): void {
    this.target = t;
  }
}
const SPEAKERS = { kind: "speakers" };
class FakeAudioContext {
  get destination(): unknown {
    return SPEAKERS;
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("master gain is installed before any AudioContext (steam)", () => {
  it("an AudioContext made before game-settings loads still goes through master × SFX", async () => {
    const store = new Map([
      [
        "steamGameSettings",
        JSON.stringify({ masterVolume: 0.5, sfxVolume: 0.6, muted: false }),
      ],
    ]);
    vi.stubGlobal("__PLATFORM__", "steam");
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("puggieDesktop", {
      version: 1,
      fullscreen: { isFullscreen: () => false, toggle: () => undefined },
      storage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    await import("../../src/ts/steam/early-audio");
    // e.g. sound-controller creating its context at import time
    const early = new window.AudioContext() as unknown as FakeAudioContext;
    const master = early.destination as FakeGain;
    expect(master).toBeInstanceOf(FakeGain);
    expect(master.target).toBe(SPEAKERS);
    expect(master.gain.value).toBeCloseTo(0.3);

    const gs = await import("../../src/ts/steam/game-settings");
    gs.installSteamGameSettings();
    // not wrapped twice
    const later = new window.AudioContext() as unknown as FakeAudioContext;
    expect((later.destination as FakeGain).target).toBe(SPEAKERS);
    gs.updateSteamSettings((s) => ({ ...s, masterVolume: 1, sfxVolume: 0.25 }));
    expect(master.gain.value).toBeCloseTo(0.25);
    gs.updateSteamSettings((s) => ({ ...s, muted: true }));
    expect(master.gain.value).toBe(0);
  });

  it("does nothing on web", async () => {
    vi.stubGlobal("__PLATFORM__", "web");
    vi.stubGlobal("AudioContext", FakeAudioContext);
    await import("../../src/ts/steam/early-audio");
    expect(window.AudioContext).toBe(FakeAudioContext);
  });

  it("is the first import of index.tsx", () => {
    const index = readFileSync(
      path.resolve(__dirname, "../../src/ts/index.tsx"),
      "utf8",
    );
    const first = /^import [^\n]+$/m.exec(index)?.[0];
    expect(first).toBe('import "./steam/early-audio";');
  });
});

describe("storedSfxGain", () => {
  it("reads master × SFX, 0 when muted, 1 for bad data", async () => {
    const { storedSfxGain } = await import("../../src/ts/steam/early-audio");
    expect(storedSfxGain(null)).toBe(1);
    expect(storedSfxGain("nope")).toBe(1);
    expect(storedSfxGain('{"masterVolume":0.5,"sfxVolume":0.5}')).toBe(0.25);
    expect(storedSfxGain('{"masterVolume":0.5,"muted":true}')).toBe(0);
    expect(storedSfxGain('{"masterVolume":7}')).toBe(1);
  });
});
