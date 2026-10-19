import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuickMatchQueue } from "../../../src/ts/multiplayer/components/QuickMatchQueue";
import {
  applyQueueStatus,
  startQueue,
} from "../../../src/ts/multiplayer/quick-match";

describe("QuickMatchQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the pug, band text and a ticking timer", () => {
    const state = applyQueueStatus(
      { band: "60–80 wpm", widenedTo: "40–100 wpm", waitedMs: 5000 },
      Date.now(),
    );
    const { getByTestId, container } = render(() => (
      <QuickMatchQueue state={state} onCancel={vi.fn()} />
    ));
    expect(container.querySelector("svg, img")).not.toBeNull();
    expect(getByTestId("mp-queue-band")).toHaveTextContent(
      "your pace: 60–80 wpm · matching 40–100 wpm",
    );
    expect(getByTestId("mp-queue-elapsed")).toHaveTextContent("0:05");
    vi.advanceTimersByTime(3010);
    expect(getByTestId("mp-queue-elapsed")).toHaveTextContent("0:08");
  });

  it("flips each second on the second boundary, every digit held ~1s (no stutter)", () => {
    // wait started 4.6s ago: first flip due in 400ms, then every 1000ms
    const state = { phase: "queued" as const, since: Date.now() - 4600 };
    const { getByTestId } = render(() => (
      <QuickMatchQueue state={state} onCancel={vi.fn()} />
    ));
    const el = getByTestId("mp-queue-elapsed");
    expect(el).toHaveTextContent("0:04");
    vi.advanceTimersByTime(390);
    expect(el).toHaveTextContent("0:04");
    vi.advanceTimersByTime(20);
    expect(el).toHaveTextContent("0:05");
    for (let s = 6; s <= 12; s++) {
      vi.advanceTimersByTime(980);
      expect(el).toHaveTextContent(`0:${String(s - 1).padStart(2, "0")}`);
      vi.advanceTimersByTime(20);
      expect(el).toHaveTextContent(`0:${String(s).padStart(2, "0")}`);
    }
  });

  it("cancel calls onCancel", () => {
    const onCancel = vi.fn();
    const { getByTestId } = render(() => (
      <QuickMatchQueue state={startQueue(Date.now())} onCancel={onCancel} />
    ));
    expect(getByTestId("mp-queue-band")).toHaveTextContent(
      "checking your pace...",
    );
    fireEvent.click(getByTestId("mp-queue-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("discloses bots in text", () => {
    const { getByTestId } = render(() => (
      <QuickMatchQueue state={startQueue(Date.now())} onCancel={vi.fn()} />
    ));
    expect(getByTestId("mp-queue")).toHaveTextContent("🤖 Bot");
  });
});
