import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  applyMasterVolume,
  applyReducedMotion,
  installMasterGain,
} from "../../src/ts/steam/game-settings";

class FakeGain {
  gain = { value: 1 };
  target: unknown;
  connect(t: unknown): void {
    this.target = t;
  }
}
const REAL_DESTINATION = { kind: "speakers" };
class FakeAudioContext {
  get destination(): unknown {
    return REAL_DESTINATION;
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
}

describe("master volume for Web Audio (click and error tones, Howler)", () => {
  it("routes each new AudioContext's destination through a master gain", () => {
    const target = {
      AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    };
    applyMasterVolume(0.4);
    installMasterGain(target);
    const ctx = new target.AudioContext() as unknown as FakeAudioContext;
    const master = ctx.destination as FakeGain;
    expect(master).toBeInstanceOf(FakeGain);
    expect(master.target).toBe(REAL_DESTINATION);
    expect(master.gain.value).toBe(0.4);
    // a tone connects to ctx.destination, i.e. through the master gain
    const tone = ctx.createGain();
    tone.connect(ctx.destination);
    expect(tone.target).toBe(master);
    applyMasterVolume(0.1);
    expect(master.gain.value).toBe(0.1);
    applyMasterVolume(1);
  });

  it("does nothing without Web Audio", () => {
    const target: { AudioContext?: typeof AudioContext } = {};
    installMasterGain(target);
    expect(target.AudioContext).toBeUndefined();
  });
});

describe("reduced motion in CSS", () => {
  it("toggles html.reduce-motion", () => {
    applyReducedMotion(true);
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(
      true,
    );
    applyReducedMotion(false);
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(
      false,
    );
  });

  it("mirrors every prefers-reduced-motion rule in the app styles", () => {
    const css = readFileSync(
      path.resolve(__dirname, "../../src/ts/steam/reduced-motion.css"),
      "utf8",
    );
    // media-queries.scss: global animation/transition kill switch
    expect(css).toContain(
      "html.reduce-motion\n  body:not(.ignore-reduced-motion)",
    );
    expect(css).toContain("scroll-behavior: auto !important");
    // test.scss typed-effect dots, pug-fast.scss, tailwind motion utilities
    for (const sel of [
      "#words.typed-effect-dots",
      ".pug-fast",
      ".pug-steam",
      ".motion-safe\\:animate-pulse",
      ".motion-reduce\\:flex",
    ]) {
      expect(css, sel).toContain(sel);
    }
    // and the app has no prefers-reduced-motion rules beyond those
    const styles = path.resolve(__dirname, "../../src/styles");
    const blocks = ["test.scss", "pug-fast.scss", "media-queries.scss"].map(
      (f) =>
        (
          readFileSync(path.join(styles, f), "utf8").match(
            /prefers-reduced-motion/g,
          ) ?? []
        ).length,
    );
    expect(blocks).toEqual([1, 1, 1]);
  });
});
