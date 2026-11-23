import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
  DECK_PROBE,
  DECK_SIZE,
  deckProbeProblems,
  padWalkProblems,
} from "../src/deck.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Run the renderer probe against a fake page. */
function probe({
  width = 1280,
  height = 800,
  scrollWidth = 1280,
  bodyScrollWidth = scrollWidth,
  getGamepads = () => [null, null, null, null],
  policy = { allowsFeature: () => true },
} = {}) {
  const navigator = {};
  if (getGamepads) navigator.getGamepads = getGamepads;
  return vm.runInNewContext(DECK_PROBE, {
    window: { innerWidth: width, innerHeight: height },
    location: { pathname: "/" },
    navigator,
    document: {
      documentElement: { scrollWidth, clientWidth: width },
      body: { scrollWidth: bodyScrollWidth },
      permissionsPolicy: policy,
    },
  });
}

describe("Steam Deck baseline (1280x800)", () => {
  it("is the Deck's screen size", () => {
    assert.deepEqual({ ...DECK_SIZE }, { width: 1280, height: 800 });
  });

  it("passes a page that fits with the Gamepad API available", () => {
    const r = probe();
    assert.equal(r.gamepads, "ok");
    assert.equal(r.gamepadPolicy, true);
    assert.deepEqual(deckProbeProblems(r), []);
  });

  it("flags horizontal overflow on the document or body", () => {
    assert.match(
      deckProbeProblems(probe({ scrollWidth: 1300 })).join(),
      /horizontal overflow/,
    );
    assert.match(
      deckProbeProblems(probe({ bodyScrollWidth: 1281 })).join(),
      /horizontal overflow/,
    );
  });

  it("flags a wrong viewport size", () => {
    assert.match(
      deckProbeProblems(probe({ width: 1920, height: 1080 })).join(),
      /viewport 1920x1080/,
    );
  });

  it("flags a missing, throwing or policy-blocked Gamepad API", () => {
    assert.match(
      deckProbeProblems(probe({ getGamepads: null })).join(),
      /getGamepads: missing/,
    );
    const blocked = () => {
      const e = new Error("blocked");
      e.name = "SecurityError";
      throw e;
    };
    assert.match(
      deckProbeProblems(probe({ getGamepads: blocked })).join(),
      /getGamepads: threw SecurityError/,
    );
    assert.match(
      deckProbeProblems(
        probe({ policy: { allowsFeature: (f) => f !== "gamepad" } }),
      ).join(),
      /permissions policy/,
    );
    // no policy API at all is not a failure
    assert.deepEqual(deckProbeProblems(probe({ policy: undefined })), []);
  });

  it("D-pad walk: focus must move every press and stay on visible controls", () => {
    assert.deepEqual(
      padWalkProblems({ steps: ["a", "b"], stuck: 0, hidden: 0 }),
      [],
    );
    assert.equal(padWalkProblems({ steps: [], stuck: 2, hidden: 1 }).length, 2);
    assert.deepEqual(padWalkProblems(undefined), ["no pad walk result"]);
  });

  it("main.mjs runs it with PUGGIE_SMOKE_DECK under the smoke test only", () => {
    const src = fs.readFileSync(path.join(here, "../src/main.mjs"), "utf8");
    assert.match(
      src,
      /const smokeDeckDir =\s+process\.env\["PUGGIE_SMOKE_TEST"\] === "1"\s+\? process\.env\["PUGGIE_SMOKE_DECK"\]/,
    );
    assert.match(src, /if \(smokeDeckDir\) deck = await runDeckSmoke\(win\);/);
    assert.match(
      src,
      /win\.setContentSize\(DECK_SIZE\.width, DECK_SIZE\.height\)/,
    );
    assert.match(src, /js\(DECK_PROBE\)/);
  });
});
