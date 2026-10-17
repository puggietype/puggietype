import { describe, it, expect } from "vitest";
import {
  PUG_FRAME_FILES,
  getHandsFrame,
  getTransitionFrame,
  getPugFrameUrl,
  getPugVariant,
  normalizePugSvg,
} from "../../../../src/ts/components/pages/test/pug-frames";

describe("pug-frames", () => {
  describe("getHandsFrame", () => {
    it.each([
      [{ left: false, right: false }, "idle"],
      [{ left: true, right: false }, "left"],
      [{ left: false, right: true }, "right"],
      [{ left: true, right: true }, "both"],
    ] as const)("%o -> %s", (hands, expected) => {
      expect(getHandsFrame(hands)).toEqual(expected);
    });
  });

  describe("getTransitionFrame", () => {
    it.each([
      ["idle", "left", "leftHalf"],
      ["left", "idle", "leftHalf"],
      ["idle", "right", "rightHalf"],
      ["right", "idle", "rightHalf"],
      ["idle", "both", undefined],
      ["both", "idle", undefined],
      ["left", "both", undefined],
      ["left", "right", undefined],
      ["idle", "idle", undefined],
    ] as const)("%s -> %s uses %s", (prev, next, expected) => {
      expect(getTransitionFrame(prev, next)).toEqual(expected);
    });
  });

  it("maps every frame to a file in /images/pug/", () => {
    expect(PUG_FRAME_FILES).toEqual({
      idle: "pug-idle.svg",
      blink: "pug-blink.svg",
      left: "pug-left-paw-down.svg",
      right: "pug-right-paw-down.svg",
      both: "pug-both-down.svg",
      leftHalf: "pug-left-paw-half.svg",
      rightHalf: "pug-right-paw-half.svg",
    });
    expect(getPugFrameUrl("both")).toEqual("/images/pug/pug-both-down.svg");
  });

  describe("normalizePugSvg", () => {
    it("strips xml prolog and fixed size so css can size it", () => {
      const out = normalizePugSvg(
        `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><path/></svg>`,
      );
      expect(out).toEqual(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path/></svg>`,
      );
    });

    it("strips the root ink colour so --pug-ink applies", () => {
      expect(
        normalizePugSvg(`<svg viewBox="0 0 1 1" color="#1C1512"><path/></svg>`),
      ).toEqual(`<svg viewBox="0 0 1 1"><path/></svg>`);
    });

    it("namespaces ids and their references with a prefix", () => {
      const out = normalizePugSvg(
        `<svg viewBox="0 0 1 1"><defs><clipPath id="a"><path/></clipPath><linearGradient id="g"/></defs><g clip-path="url(#a)" fill="url( #g )"><use href="#a" xlink:href="#g"/></g></svg>`,
        "pug-idle-",
      );
      expect(out).toEqual(
        `<svg viewBox="0 0 1 1"><defs><clipPath id="pug-idle-a"><path/></clipPath><linearGradient id="pug-idle-g"/></defs><g clip-path="url(#pug-idle-a)" fill="url(#pug-idle-g)"><use href="#pug-idle-a" xlink:href="#pug-idle-g"/></g></svg>`,
      );
    });

    it("rejects non-svg content", () => {
      expect(normalizePugSvg("<html>404</html>")).toBeUndefined();
    });

    it("drops scripts and event handlers", () => {
      const out = normalizePugSvg(
        `<svg viewBox="0 0 1 1"><script>alert(1)</script><path onclick="x()"/></svg>`,
      );
      expect(out).toEqual(`<svg viewBox="0 0 1 1"><path/></svg>`);
    });
  });

  describe("getPugVariant", () => {
    it.each([
      ["puggie_dark", "color"],
      ["puggie_light", "color"],
      ["midnight_chow", "color"],
      ["serika_dark", "mono"],
      ["custom", "mono"],
    ])("%s -> %s", (theme, variant) => {
      expect(getPugVariant(theme)).toEqual(variant);
    });
  });
});
