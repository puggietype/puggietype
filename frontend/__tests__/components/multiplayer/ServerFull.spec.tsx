import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FullState } from "../../../src/ts/multiplayer/capacity";

import { ServerFull } from "../../../src/ts/multiplayer/components/ServerFull";

describe("ServerFull", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("announces the full state politely and counts down", () => {
    const state: FullState = {
      scope: "socket",
      retryAt: Date.now() + 42_000,
      retrying: false,
    };
    const { getByRole, getByTestId } = render(() => (
      <ServerFull state={state} onRetry={vi.fn()} />
    ));
    const status = getByRole("status");
    expect(status).toHaveTextContent("We're full right now");
    expect(status).toHaveTextContent("Try again in a minute.");
    // the ticking timer stays out of the live region
    expect(status).not.toContainElement(getByTestId("mp-full-countdown"));
    expect(getByRole("timer")).toHaveTextContent("trying again in 42s");
    vi.advanceTimersByTime(2_000);
    expect(getByRole("timer")).toHaveTextContent("trying again in 40s");
    expect(getByRole("heading", { level: 2 })).toHaveAccessibleName(
      "We're full right now",
    );
  });

  it("try now retries; solo links to the test page", () => {
    const onRetry = vi.fn();
    const { getByTestId } = render(() => (
      <ServerFull
        state={{ scope: "room", retryAt: Date.now() + 5_000, retrying: false }}
        onRetry={onRetry}
      />
    ));
    fireEvent.click(getByTestId("mp-full-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    const solo = getByTestId("mp-full-solo");
    expect(solo).toHaveAttribute("href", "/");
    expect(solo).toHaveAttribute("router-link");
    expect(solo).toHaveTextContent("Practice solo while you wait");
  });

  it("while retrying: says so and disables try now", () => {
    const { getByTestId } = render(() => (
      <ServerFull
        state={{ scope: "socket", retryAt: Date.now(), retrying: true }}
        onRetry={vi.fn()}
      />
    ));
    expect(getByTestId("mp-full-retrying")).toHaveTextContent(
      "trying again...",
    );
    expect(getByTestId("mp-full-retry")).toBeDisabled();
  });
});
