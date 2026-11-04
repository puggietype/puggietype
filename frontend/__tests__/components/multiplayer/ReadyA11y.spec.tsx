import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReadyButton } from "../../../src/ts/multiplayer/components/ReadyButton";
import { ReadyCount } from "../../../src/ts/multiplayer/components/ReadyCount";

describe("ready a11y", () => {
  afterEach(cleanup);

  it("Ready is a toggle button: aria-pressed follows the ready state", () => {
    const [ready, setReady] = createSignal(false);
    const onToggle = vi.fn((r: boolean) => setReady(r));
    render(() => (
      <ReadyButton ready={ready()} text="Ready" onToggle={onToggle} />
    ));
    const button = screen.getByTestId("mp-ready");
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("Ready");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("Ready ✓");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenLastCalledWith(false);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("N/M ready count is a polite live region and updates in place", () => {
    const [n, setN] = createSignal(1);
    render(() => <ReadyCount ready={n()} total={3} />);
    const count = screen.getByTestId("mp-ready-count");
    expect(count).toHaveAttribute("aria-live", "polite");
    expect(count).toHaveAttribute("aria-atomic", "true");
    expect(count).toHaveTextContent("1/3 ready");
    setN(3);
    expect(screen.getByTestId("mp-ready-count")).toBe(count);
    expect(count).toHaveTextContent("3/3 ready");
  });

  it("plain buttons get no aria-pressed", async () => {
    const { Button } = await import("../../../src/ts/components/common/Button");
    render(() => <Button text="x" dataset={{ "data-testid": "plain" }} />);
    expect(screen.getByTestId("plain")).not.toHaveAttribute("aria-pressed");
  });
});
