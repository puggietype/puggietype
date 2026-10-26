import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomState } from "../../../src/ts/multiplayer/protocol";

vi.mock("../../../src/ts/multiplayer/feature-flags", () => ({
  isFlagEnabled: () => false,
}));

const Store = await import("../../../src/ts/multiplayer/store");
const { RaceProgressBars, fillTransform } =
  await import("../../../src/ts/multiplayer/components/RaceProgressBars");

const player = (
  id: string,
  finished: boolean,
): RoomState["players"][number] => ({
  id,
  name: id,
  isBot: false,
  color: "opp1",
  ready: true,
  connected: true,
  character: "puggie",
  progress: { wordIndex: 0, charIndex: 0, testMs: 0, wpm: 0 },
  finished,
});

describe("fillTransform", () => {
  it("slides a full-width fill instead of scaling it (keeps the rounded end)", () => {
    expect(fillTransform(0)).toBe("translateX(-100.0%)");
    expect(fillTransform(0.1)).toBe("translateX(-90.0%)");
    expect(fillTransform(0.5)).toBe("translateX(-50.0%)");
    expect(fillTransform(0.1)).not.toContain("scale");
  });

  it("is exactly full at 100% and clamps out-of-range input", () => {
    expect(fillTransform(1)).toBe("translateX(0%)");
    expect(fillTransform(0.9999)).toBe("translateX(0%)");
    expect(fillTransform(1.5)).toBe("translateX(0%)");
    expect(fillTransform(-1)).toBe("translateX(-100.0%)");
  });
});

describe("RaceProgressBars fill", () => {
  afterEach(() => cleanup());

  it("finished player's fill covers the whole track", () => {
    const settings: RoomState["settings"] = {
      mode: "words",
      mode2: 10,
      punctuation: false,
      numbers: false,
      language: "english",
    };
    Store.setMyId("me");
    Store.setRoom({
      code: "ABCD2345",
      hostId: "me",
      phase: "racing",
      settings,
      settingsVersion: 1,
      open: false,
      quickMatch: false,
      players: [player("me", false), player("done", true)],
    });
    Store.setOpponentProgress([]);
    Store.setRace({ startAt: 0, words: ["hello", "world"], settings });

    const { container } = render(() => <RaceProgressBars />);
    const fill = (id: string): HTMLElement => {
      const el = container.querySelector<HTMLElement>(
        `[data-testid='mp-progress-row'][data-player-id='${id}'] [data-testid='mp-progress-fill']`,
      );
      if (el === null) throw new Error(`no fill for ${id}`);
      return el;
    };

    expect(fill("done").style.transform).toBe("translateX(0%)");
    expect(fill("done")).toHaveClass("w-full", "rounded-full");
    expect(fill("me").style.transform).toBe("translateX(-100.0%)");
  });
});
